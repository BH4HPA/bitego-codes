const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, bearerAuthz } = require('./testUtils')

test('platform snapshot reset works', async () => {
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const r = await jsonFetch(`${base}/api/v1/platform/snapshot/reset`, {
        method: 'POST',
        headers: bearerAuthz(token)
      })
      assert.equal(r.resp.status, 200)
      assert.equal(r.json.success, true)
    },
    undefined,
    undefined,
    { withDb: true, withRedis: true }
  )
})

test('platform snapshot import rejects invalid json', async () => {
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const form = new FormData()
      form.append('file', new Blob(['not json'], { type: 'application/json' }), 'bad.json')
      const r = await jsonFetch(`${base}/api/v1/platform/snapshot/import`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: form
      })
      assert.equal(r.resp.status, 400)
    },
    undefined,
    undefined,
    { withDb: true, withRedis: true }
  )
})

test('platform snapshot import requires file', async () => {
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const r = await jsonFetch(`${base}/api/v1/platform/snapshot/import`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: new FormData()
      })
      assert.equal(r.resp.status, 400)
    },
    undefined,
    undefined,
    { withDb: true, withRedis: true }
  )
})
