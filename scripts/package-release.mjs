import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = path.join(root, 'dist')
const output = path.join(root, 'artifacts')
const source = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8').catch(() => { throw new Error('Build first: npm run build') }))
if (manifest.version !== pkg.version || source.version !== pkg.version) throw new Error('Manifest and package versions must match.')
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${pkg.version}`) throw new Error('Release tag must match package.json.')
if (manifest.manifest_version !== 3 || !manifest.background?.service_worker) throw new Error('Expected the production Manifest V3 build.')

const refs = [manifest.background.service_worker, manifest.action?.default_popup, manifest.options_page,
  ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((script) => [...(script.js || []), ...(script.css || [])]),
  ...(manifest.web_accessible_resources || []).flatMap((resource) => resource.resources || []),
  'main-world.js', 'offscreen.js', 'offscreen.html',
].filter(Boolean)
for (const ref of refs) {
  if (ref.includes('*')) continue
  if (ref.endsWith('.ts') || ref.endsWith('.tsx')) throw new Error(`Uncompiled manifest entry: ${ref}`)
  const resolved = path.resolve(dist, ref)
  if (!resolved.startsWith(dist + path.sep)) throw new Error(`Entry escapes the package: ${ref}`)
  if (!(await stat(resolved).catch(() => null))?.isFile()) throw new Error(`Missing manifest entry: ${ref}`)
}
for (const pattern of [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])]) {
  const host = pattern.split('://')[1]?.split('/')[0] || ''
  if ((host.match(/\*/g) || []).length > 1) throw new Error(`Invalid host wildcard: ${pattern}`)
}

async function walk(dir) {
  const found = []
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error(`Do not ship symlinks: ${entry.name}`)
    const item = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await walk(item))
    else if (entry.isFile()) found.push(item)
  }
  return found
}

const files = new Map()
for (const file of await walk(dist)) {
  const relative = path.relative(dist, file).split(path.sep).join('/')
  if (/\.DS_Store|(^|\/)\.(?:git|env)|\.map$/.test(relative)) throw new Error(`Unexpected release file: ${relative}`)
  const body = await readFile(file)
  if (/\.(?:js|css|html|json)$/.test(relative)) {
    const text = body.toString('utf8')
    if (/\/Users\/|[A-Z]:\\Users\\|NicheRadar|ifs-radar/.test(text)) throw new Error(`Local or removed-feature data in ${relative}`)
    if (/(?:gh[pousr]_[A-Za-z0-9]{25,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(text)) throw new Error(`Possible credential in ${relative}`)
  }
  files.set(relative, body)
}
for (const file of ['INSTALL.md', 'PRIVACY.md', 'LICENSE']) files.set(file, await readFile(path.join(root, file)))
files.set('INSTALL.vi.md', await readFile(path.join(root, 'docs/INSTALL.vi.md')))

async function locate(name, from) {
  let dir = from
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name, 'package.json')
    if ((await stat(candidate).catch(() => null))?.isFile()) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`Cannot locate dependency: ${name}`)
    dir = parent
  }
}

const queue = ['react', 'react-dom', 'idb', 'jszip'].map((name) => ({ name, from: root }))
const seen = new Set()
const notices = []
while (queue.length) {
  const { name, from } = queue.shift()
  const jsonPath = await locate(name, from)
  const data = JSON.parse(await readFile(jsonPath, 'utf8'))
  const id = `${data.name}@${data.version}`
  if (seen.has(id)) continue
  seen.add(id)
  const dir = path.dirname(jsonPath)
  const entries = await readdir(dir)
  const licenses = entries.filter((file) => /^(license|licence|copying)(\.|$)/i.test(file)).sort()
  let terms = (await Promise.all(licenses.map((file) => readFile(path.join(dir, file), 'utf8')))).join('\n\n')
  if (!terms) {
    const readme = entries.find((file) => /^readme(\.|$)/i.test(file))
    const body = readme ? await readFile(path.join(dir, readme), 'utf8') : ''
    const heading = body.match(/^#{1,3}\s+licen[sc]e\b.*$/im)
    if (heading) terms = body.slice(heading.index)
  }
  if (!terms) throw new Error(`Missing dependency license notice: ${id}`)
  notices.push(`${id}\nLicense: ${data.license || 'See terms below'}\n${'='.repeat(72)}\n${terms.trim()}`)
  for (const dependency of Object.keys(data.dependencies || {}).sort()) queue.push({ name: dependency, from: dir })
}
const noticeText = `Third-party notices for browser dependencies and their runtime dependency trees.\nJSZip is used under its MIT license option. Additional original license text is retained below.\n\n${notices.sort().join('\n\n' + '-'.repeat(72) + '\n\n')}\n`
files.set('THIRD_PARTY_NOTICES.txt', Buffer.from(noticeText))

const zip = new JSZip()
for (const [name, body] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
  zip.file(name, body, { date: new Date('2000-01-01T00:00:00Z'), createFolders: false, unixPermissions: 0o100644 })
}
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' })
const verified = await JSZip.loadAsync(bytes, { checkCRC32: true })
for (const [name, body] of files) {
  const entry = verified.file(name)
  if (!entry || !(await entry.async('nodebuffer')).equals(body)) throw new Error(`ZIP verification failed: ${name}`)
}
const filename = `instagram-feed-sorter-v${pkg.version}.zip`
const checksum = createHash('sha256').update(bytes).digest('hex')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, filename), bytes)
await writeFile(path.join(output, 'SHA256SUMS.txt'), `${checksum}  ${filename}\n`)
console.log(JSON.stringify({ version: pkg.version, file: filename, bytes: bytes.length, files: files.size, dependencyNotices: seen.size, sha256: checksum }, null, 2))
