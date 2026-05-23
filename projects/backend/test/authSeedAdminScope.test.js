const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch } = require('./testUtils')

test('auth login seeds SUPER_ADMIN scope for initial admin', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const User = require('../dist/entities/User').User
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    const userRepo = ctx.AppDataSource.getRepository(User)

    await scopeRepo.delete({ userId: 'admin_1', role: 'SUPER_ADMIN' })
    await userRepo.update({ userId: 'admin_1' }, { username: 'admin', userType: 'ADMIN', passwordHash: 'invalid' })

    const login = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(login.resp.status, 200)

    const scopes1 = await scopeRepo.find({ where: { userId: 'admin_1', role: 'SUPER_ADMIN', status: 'ACTIVE' } })
    assert.equal(scopes1.length >= 1, true)

    await userRepo.update({ userId: 'admin_1' }, { passwordHash: 'invalid' })
    const login2 = await jsonFetch(`${ctx.base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(login2.resp.status, 200)
  })
})
