import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { allowedRequest, createMcp, startOwner } from './server.mjs'

test('local server rejects website origins, opaque origins and DNS rebinding hosts', () => {
  const req = (origin, host = '127.0.0.1:47331') => ({ headers: { host, ...(origin === undefined ? {} : { origin }) } })
  assert.equal(allowedRequest(req(undefined)), true)
  assert.equal(allowedRequest(req(`chrome-extension://${'a'.repeat(32)}`)), true)
  for (const origin of ['null', 'https://evil.example', 'http://localhost:5174', 'file://', 'chrome-extension://bad']) assert.equal(allowedRequest(req(origin)), false)
  assert.equal(allowedRequest(req(undefined, 'evil.example:47331')), false)
})

test('MCP lists the three Sorter tools and dispatches validated sort requests', async () => {
  const calls = []
  const server = createMcp(async (...args) => { calls.push(args); return { total: 1 } })
  const client = new Client({ name: 'research-test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  await client.connect(b)
  try {
    const { tools } = await client.listTools()
    assert.equal(tools.length, 3)
    assert.equal(tools.find((tool) => tool.name === 'sort_instagram').annotations.readOnlyHint, false)
    const result = await client.callTool({ name: 'sort_instagram', arguments: { username: 'example', count: 5 } })
    assert.equal(result.isError, undefined)
    assert.equal(calls[0][0], 'sort')
    assert.deepEqual(calls[0][1], { username: 'example', count: 5 })
    const invalid = await client.callTool({ name: 'sort_instagram', arguments: { count: 0 } })
    assert.equal(invalid.isError, true)
    assert.equal(calls.length, 1)
  } finally { await client.close(); await server.close() }
})

test('MCP reports tool failures as errors', async () => {
  const server = createMcp(async () => { throw new Error('Chrome is offline') })
  const client = new Client({ name: 'failure-test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a); await client.connect(b)
  try {
    const result = await client.callTool({ name: 'related_instagram_profiles', arguments: { username: 'example' } })
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /Chrome is offline/)
  } finally { await client.close(); await server.close() }
})

test('HTTP bridge keeps a waiting extension poll alive and correlates results', async () => {
  const owner = await startOwner({ port: 0 })
  const url = `http://127.0.0.1:${owner.server.address().port}`
  const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const blocked = await fetch(url + '/health', { headers: { origin: 'https://evil.example' } })
    assert.equal(blocked.status, 403)
    const poll = post('/bridge/next', {})
    // Wait until the request body is fully read before enqueueing the job.
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await (await fetch(url + '/health')).json()).extension) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const outcome = owner.enqueue('sort', { username: 'example', count: 5 }, 3000)
    const job = await (await poll).json()
    assert.equal(job.type, 'sort')
    const stale = await (await post('/bridge/result', { id: 'wrong-id', ok: true, result: { total: 999 } })).json()
    assert.equal(stale.accepted, false)
    const delivered = await (await post('/bridge/result', { id: job.id, ok: true, result: { total: 1 } })).json()
    assert.equal(delivered.accepted, true)
    assert.deepEqual(await outcome, { total: 1 })
  } finally { await owner.close() }
})

test('HTTP MCP initializes and discovers tools over Streamable HTTP', async () => {
  const owner = await startOwner({ port: 0 })
  const client = new Client({ name: 'http-test', version: '1' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${owner.server.address().port}/mcp`)))
    const { tools } = await client.listTools()
    assert.equal(tools.length, 3)
  } finally { await client.close(); await owner.close() }
})
