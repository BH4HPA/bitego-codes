const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, platformAdminAuthz, storeAdminAuthz } = require('./testUtils')

test('coverage: platform users extra branches', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store
    const User = require('../dist/entities/User').User

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

    const forbid0 = await jsonFetch(`${ctx.base}/api/v1/platform/users?page=1&pageSize=1`, {
      headers: storeAdminAuthz(storeAdminToken, tenantId, storeId)
    })
    assert.equal(forbid0.resp.status, 403)

    const badDetail0 = await jsonFetch(`${ctx.base}/api/v1/platform/users/%20`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(badDetail0.resp.status, 400)

    const badCreate0 = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: '12345' })
    })
    assert.equal(badCreate0.resp.status, 400)

    const badCreate1 = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: '123456', nickname: 'x'.repeat(21) })
    })
    assert.equal(badCreate1.resp.status, 400)

    const badCreate2 = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: '123456', avatarUrl: 'x'.repeat(501) })
    })
    assert.equal(badCreate2.resp.status, 400)

    const badScope0 = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `u_${Date.now()}`,
        password: '123456',
        scopes: [{ tenantId, role: 'STORE_ADMIN' }]
      })
    })
    assert.equal(badScope0.resp.status, 400)

    const badScope1 = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `u_${Date.now()}`,
        password: '123456',
        scopes: [{ tenantId, role: 'SUPER_ADMIN', storeId }]
      })
    })
    assert.equal(badScope1.resp.status, 400)

    const badScope2 = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `u_${Date.now()}`,
        password: '123456',
        scopes: [{ tenantId, role: 'TENANT_ADMIN', storeId }]
      })
    })
    assert.equal(badScope2.resp.status, 400)

    const badTenant = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `u_${Date.now()}`,
        password: '123456',
        scopes: [{ tenantId: `t_missing_${Date.now()}`, role: 'TENANT_ADMIN' }]
      })
    })
    assert.equal(badTenant.resp.status, 404)

    const badStore = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `u_${Date.now()}`,
        password: '123456',
        scopes: [{ tenantId, role: 'STORE_ADMIN', storeId: `s_missing_${Date.now()}` }]
      })
    })
    assert.equal(badStore.resp.status, 404)

    const username = `u_${Date.now()}`
    const created = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: '123456', scopes: [] })
    })
    assert.equal(created.resp.status, 200)
    const newUserId = created.json.data.userId
    assert.ok(newUserId)

    const dup = await jsonFetch(`${ctx.base}/api/v1/platform/users`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: '123456' })
    })
    assert.equal(dup.resp.status, 400)

    const list = await jsonFetch(
      `${ctx.base}/api/v1/platform/users?page=1&pageSize=10&keyword=${encodeURIComponent('u_')}`,
      { headers: platformAdminAuthz(superToken) }
    )
    assert.equal(list.resp.status, 200)

    const userRepo = ctx.AppDataSource.getRepository(User)
    const customer = await userRepo.save(
      userRepo.create({
        userId: `usr_${Date.now()}`,
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'C',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE'
      })
    )
    const delCustomer = await jsonFetch(`${ctx.base}/api/v1/platform/users/${encodeURIComponent(customer.userId)}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(delCustomer.resp.status, 400)

    const delSelf = await jsonFetch(`${ctx.base}/api/v1/platform/users/${encodeURIComponent(superUserId)}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(delSelf.resp.status, 400)
  })
})
