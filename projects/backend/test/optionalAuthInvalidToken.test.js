const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch } = require('./testUtils')

test('optionalAuth rejects invalid bearer token', async () => {
  await withServer(async ({ base }) => {
    const resp = await jsonFetch(`${base}/api/v1/tables/A01`, {
      headers: { authorization: 'Bearer invalid.token' }
    })
    assert.equal(resp.resp.status, 401)
    assert.equal(resp.json.code, 40101)
  })
})
