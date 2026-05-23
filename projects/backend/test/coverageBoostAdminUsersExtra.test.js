const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, bearerAuthz } = require('./testUtils')

test('admin users: cover extra validation branches', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const adminUserId = `adm_${Date.now()}`
    const token = await getDevToken(base, 'ADMIN', adminUserId)
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: adminUserId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authz = { ...bearerAuthz(token), 'content-type': 'application/json' }

    const r0 = await jsonFetch(`${base}/api/v1/admin/users`, {
      method: 'POST',
      headers: authz,
      body: JSON.stringify({ username: `u_${Date.now()}`, password: '12345' })
    })
    assert.equal(r0.resp.status, 400)

    const r1 = await jsonFetch(`${base}/api/v1/admin/users`, {
      method: 'POST',
      headers: authz,
      body: JSON.stringify({ username: `u_${Date.now()}`, password: '123456', nickname: 'x'.repeat(21) })
    })
    assert.equal(r1.resp.status, 400)

    const r2 = await jsonFetch(`${base}/api/v1/admin/users`, {
      method: 'POST',
      headers: authz,
      body: JSON.stringify({ username: `u_${Date.now()}`, password: '123456', avatarUrl: 'x'.repeat(501) })
    })
    assert.equal(r2.resp.status, 400)

    const r3 = await jsonFetch(`${base}/api/v1/admin/users?page=1&pageSize=10&keyword=admin`, {
      headers: bearerAuthz(token)
    })
    assert.equal(r3.resp.status, 200)
    assert.ok(r3.json && r3.json.data && Array.isArray(r3.json.data.list))

    const r4 = await jsonFetch(`${base}/api/v1/admin/me/password`, {
      method: 'PUT',
      headers: authz,
      body: JSON.stringify({ oldPassword: 'old', newPassword: 'newpass1' })
    })
    assert.equal(r4.resp.status, 404)
  })
})
