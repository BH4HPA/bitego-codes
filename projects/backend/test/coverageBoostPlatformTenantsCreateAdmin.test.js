const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('platform tenant create does not create admin users/scopes', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { AdminScope } = require('../dist/entities/AdminScope')
    const { User } = require('../dist/entities/User')

    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const userRepo = AppDataSource.getRepository(User)

    const superId = `admin_sup_${Date.now()}`
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId: superId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authz = await getAuthz(base, 'ADMIN', superId)

    const beforeUsers = await userRepo.count()
    const r = await jsonFetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ type: 'CHAIN', brandName: `B_${Date.now()}`, brandLogoUrl: null })
    })
    assert.equal(r.resp.status, 200)
    assert.ok(r.json && r.json.success)
    assert.ok(r.json.data && r.json.data.tenantId)
    assert.ok(r.json.data.primaryStoreId)
    assert.equal(r.json.data.tenantAdmin, undefined)
    assert.equal(r.json.data.storeAdmin, undefined)

    const afterUsers = await userRepo.count()
    assert.equal(afterUsers, beforeUsers)

    const createdScopes = await scopeRepo.find({ where: { tenantId: r.json.data.tenantId, status: 'ACTIVE' } })
    assert.equal(createdScopes.length, 0)
  })
})
