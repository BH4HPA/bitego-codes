const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, platformAdminAuthz, storeAdminAuthz } = require('./testUtils')

test('platform users: super admin manage admin users with scopes; non-super forbidden', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantId = `t_${Date.now()}`
    const storeId = `s_${Date.now()}`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId: storeId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'S',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    const superUserId = `super_${Date.now()}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: superUserId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )

    const storeAdminUserId = `sa_${Date.now()}`
    const storeAdminToken = await getDevToken(ctx.base, 'ADMIN', storeAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storeAdminUserId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const forbidAdminUsers = await jsonFetch(`${ctx.base}/api/v1/admin/users?page=1&pageSize=10`, {
      headers: storeAdminAuthz(storeAdminToken, tenantId, storeId)
    })
    assert.equal(forbidAdminUsers.resp.status, 403)

    const created = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `u_${Date.now()}`,
        password: '12345678',
        scopes: [
          { tenantId, role: 'TENANT_ADMIN' },
          { tenantId, role: 'STORE_ADMIN', storeId }
        ]
      })
    })
    assert.equal(created.resp.status, 200)
    const userId = created.json.data.userId
    assert.ok(userId)
    assert.equal(created.json.data.scopeIds.length, 2)

    const detail = await jsonFetch(`${ctx.base}/api/v1/platform/users/${encodeURIComponent(userId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(detail.resp.status, 200)
    assert.equal(detail.json.data.user.userId, userId)
    assert.equal(detail.json.data.scopes.length, 2)

    const missingDetail = await jsonFetch(`${ctx.base}/api/v1/platform/users/u_missing_${Date.now()}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(missingDetail.resp.status, 404)

    const list = await jsonFetch(`${ctx.base}/api/v1/platform/users?userType=ADMIN&page=1&pageSize=50`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(list.resp.status, 200)
    assert.ok(list.json.data.list.some((u) => u.userId === userId))

    const del = await jsonFetch(`${ctx.base}/api/v1/platform/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(del.resp.status, 200)

    const detail404 = await jsonFetch(`${ctx.base}/api/v1/platform/users/${encodeURIComponent(userId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(detail404.resp.status, 404)

    const missingDel = await jsonFetch(`${ctx.base}/api/v1/platform/users/u_missing_${Date.now()}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(missingDel.resp.status, 404)

    const listScopes = await jsonFetch(`${ctx.base}/api/v1/admin/scopes?userId=${encodeURIComponent(userId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(listScopes.resp.status, 200)
    assert.equal(listScopes.json.data.list.length, 0)
  })
})
