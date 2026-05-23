const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch } = require('./testUtils')

test('auth login covers validation and normal admin password path', async () => {
  await withServer(async (ctx) => {
    const bad0 = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '', password: '' })
    })
    assert.equal(bad0.resp.status, 400)

    const bad1 = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' })
    })
    assert.equal(bad1.resp.status, 401)

    const seed = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(seed.resp.status, 200)

    const normal = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(normal.resp.status, 200)
  })
})

test('auth login fills missing nickname and avatarUrl for seeded admin', async () => {
  await withServer(async (ctx) => {
    const User = require('../dist/entities/User').User
    const userRepo = ctx.AppDataSource.getRepository(User)
    const seed = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(seed.resp.status, 200)

    await userRepo.update(
      { userId: 'admin_1' },
      { nickname: '', avatarUrl: null, passwordHash: 'invalid', username: 'admin', userType: 'ADMIN' }
    )

    const login = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(login.resp.status, 200)

    const row = await userRepo.findOne({ where: { userId: 'admin_1' } })
    assert.ok(row)
    assert.equal(row.nickname, '管理员')
    assert.equal(row.avatarUrl, '')
  })
})
