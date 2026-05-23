const test = require('node:test')
const assert = require('node:assert/strict')
const {
  withServer,
  getDevToken,
  jsonFetch,
  platformAdminAuthz,
  tenantAdminAuthz,
  storeAdminAuthz
} = require('./testUtils')

test('platform/tenant stores: cover error branches', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantId = `t_${Date.now()}`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId: null,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    const storeId = `s_${Date.now()}`
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId,
        isPrimary: 0,
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

    const badDetail0 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/%20`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(badDetail0.resp.status, 400)

    const badDetail1 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/s_missing_${Date.now()}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(badDetail1.resp.status, 404)

    const badCreate0 = await jsonFetch(`${ctx.base}/api/v1/platform/stores`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId })
    })
    assert.equal(badCreate0.resp.status, 400)

    const badCreate1 = await jsonFetch(`${ctx.base}/api/v1/platform/stores`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: `t_missing_${Date.now()}`, name: 'X' })
    })
    assert.equal(badCreate1.resp.status, 404)

    const fixedStoreId = `store_fixed_${Date.now()}`
    const okCreate = await jsonFetch(`${ctx.base}/api/v1/platform/stores`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, name: 'X', storeId: fixedStoreId })
    })
    assert.equal(okCreate.resp.status, 200)

    const dupCreate = await jsonFetch(`${ctx.base}/api/v1/platform/stores`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, name: 'X2', storeId: fixedStoreId })
    })
    assert.equal(dupCreate.resp.status, 400)

    const badUpdate0 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/%20`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Y' })
    })
    assert.equal(badUpdate0.resp.status, 400)

    const badUpdate1 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/s_missing_${Date.now()}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Y' })
    })
    assert.equal(badUpdate1.resp.status, 404)

    const badUpdate2 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/${encodeURIComponent(fixedStoreId)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' })
    })
    assert.equal(badUpdate2.resp.status, 400)

    const badDelete0 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/%20`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(badDelete0.resp.status, 400)

    const badDelete1 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/s_missing_${Date.now()}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(badDelete1.resp.status, 404)

    const tenantAdminUserId = `ta_${Date.now()}`
    const tenantAdminToken = await getDevToken(ctx.base, 'ADMIN', tenantAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: tenantAdminUserId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const badTenantList = await jsonFetch(`${ctx.base}/api/v1/tenant/stores?page=1&pageSize=1`, {
      headers: tenantAdminAuthz(superToken, `t_missing_${Date.now()}`)
    })
    assert.equal(badTenantList.resp.status, 404)

    const badTenantCreate0 = await jsonFetch(`${ctx.base}/api/v1/tenant/stores`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({})
    })
    assert.equal(badTenantCreate0.resp.status, 400)

    const fixedTenantStoreId = `store_t_${Date.now()}`
    const okTenantCreate = await jsonFetch(`${ctx.base}/api/v1/tenant/stores`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'T', storeId: fixedTenantStoreId })
    })
    assert.equal(okTenantCreate.resp.status, 200)

    const dupTenantCreate = await jsonFetch(`${ctx.base}/api/v1/tenant/stores`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'T2', storeId: fixedTenantStoreId })
    })
    assert.equal(dupTenantCreate.resp.status, 400)

    const badTenantDetail0 = await jsonFetch(`${ctx.base}/api/v1/tenant/stores/%20`, {
      headers: tenantAdminAuthz(tenantAdminToken, tenantId)
    })
    assert.equal(badTenantDetail0.resp.status, 400)

    const badTenantDetail1 = await jsonFetch(`${ctx.base}/api/v1/tenant/stores/s_missing_${Date.now()}`, {
      headers: tenantAdminAuthz(tenantAdminToken, tenantId)
    })
    assert.equal(badTenantDetail1.resp.status, 404)

    const badTenantDel1 = await jsonFetch(`${ctx.base}/api/v1/tenant/stores/s_missing_${Date.now()}`, {
      method: 'DELETE',
      headers: tenantAdminAuthz(tenantAdminToken, tenantId)
    })
    assert.equal(badTenantDel1.resp.status, 404)

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

    const forbidTenantList = await jsonFetch(`${ctx.base}/api/v1/tenant/stores?page=1&pageSize=1`, {
      headers: storeAdminAuthz(storeAdminToken, tenantId, storeId)
    })
    assert.equal(forbidTenantList.resp.status, 403)
  })
})
