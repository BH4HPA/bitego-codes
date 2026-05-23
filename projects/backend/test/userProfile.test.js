const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch, customerAuthz } = require('./testUtils')

test('user can update nickname and avatarUrl', async () => {
  await withServer(async ({ base }) => {
    const { resp: tokenResp, json: tokenJson } = await jsonFetch(`${base}/api/v1/auth/dev-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'CUSTOMER', userId: `usr_${Date.now()}`, nickname: '', avatarUrl: '' })
    })
    assert.equal(tokenResp.status, 200)
    const token = tokenJson.data.token
    const authz = customerAuthz(token)

    const upd = await fetch(`${base}/api/v1/users/me/profile`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: '张三', avatarUrl: 'https://example.com/a.png' })
    })
    assert.equal(upd.status, 200)
    const updJson = await upd.json()
    assert.ok(updJson.data.token)

    const meOldToken = await fetch(`${base}/api/v1/users/me`, { headers: authz })
    assert.equal(meOldToken.status, 200)
    const meOldTokenJson = await meOldToken.json()
    assert.equal(meOldTokenJson.data.nickname, '张三')
    assert.equal(meOldTokenJson.data.avatarUrl, 'https://example.com/a.png')

    const meNewToken = await fetch(`${base}/api/v1/users/me`, {
      headers: customerAuthz(updJson.data.token)
    })
    assert.equal(meNewToken.status, 200)
    const meNewTokenJson = await meNewToken.json()
    assert.equal(meNewTokenJson.data.nickname, '张三')
    assert.equal(meNewTokenJson.data.avatarUrl, 'https://example.com/a.png')
  })
})
