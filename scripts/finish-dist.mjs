import { readFileSync, writeFileSync } from 'node:fs'

const manifestPath = new URL('../dist/manifest.json', import.meta.url)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

manifest.content_scripts = [
  {
    matches: ['https://www.instagram.com/*', 'https://instagram.com/*'],
    js: ['main-world.js'],
    run_at: 'document_start',
    world: 'MAIN',
  },
  ...(manifest.content_scripts ?? []).filter((script) => !script.js?.includes('main-world.js')),
]

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const htmlPath = new URL('../dist/offscreen.html', import.meta.url)
writeFileSync(
  htmlPath,
  '<!doctype html><meta charset="utf-8"><title>Instagram Feed Sorter</title><script src="./offscreen.js"></script>\n',
)
