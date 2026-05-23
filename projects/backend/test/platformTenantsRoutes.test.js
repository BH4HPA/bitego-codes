const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, platformAdminAuthz, storeAdminAuthz } = require('./testUtils')

test('platform tenants: SUPER_ADMIN can list and get detail; others forbidden', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const repo = ctx.AppDataSource.getRepository(Tenant)
    const tenantId = `t_${Date.now()}`
    await repo.save(
      repo.create({
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

    const superUserId = `super_${Date.now()}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId: superUserId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )

    const list = await jsonFetch(`${ctx.base}/api/v1/platform/tenants?page=1&pageSize=50`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(list.resp.status, 200)
    assert.ok(Array.isArray(list.json.data.list))
    assert.ok(list.json.data.list.some((t) => t.tenantId === tenantId))

    const detail = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(detail.resp.status, 200)
    assert.equal(detail.json.data.tenantId, tenantId)
    assert.equal(detail.json.data.brandName, 'Brand')

    const r404 = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/t_missing_${Date.now()}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(r404.resp.status, 404)

    const storeId = `s_${Date.now()}`
    const storeRepo = ctx.AppDataSource.getRepository(Store)
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

    const storeAdminUserId = `u_${Date.now()}`
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

    const forbid = await jsonFetch(`${ctx.base}/api/v1/platform/tenants?page=1&pageSize=10`, {
      headers: storeAdminAuthz(storeAdminToken, tenantId, storeId)
    })
    assert.equal(forbid.resp.status, 403)
  })
})

test('platform tenants: list response includes primaryStoreName resolved from Store.name', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    const storeRepo = ctx.AppDataSource.getRepository(Store)

    const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const tenantWithStoreId = `tns_${stamp}_a`
    const tenantWithStoreStoreId = `sns_${stamp}_a`
    const tenantWithoutStoreId = `tns_${stamp}_b`

    await storeRepo.save(
      storeRepo.create({
        storeId: tenantWithStoreStoreId,
        tenantId: tenantWithStoreId,
        isPrimary: 1,
        subName: null,
        name: '主门店名称',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await tenantRepo.save(
      tenantRepo.create({
        tenantId: tenantWithStoreId,
        type: 'CHAIN',
        brandName: 'BrandWithStore',
        brandLogoUrl: null,
        primaryStoreId: tenantWithStoreStoreId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )
    await tenantRepo.save(
      tenantRepo.create({
        tenantId: tenantWithoutStoreId,
        type: 'CHAIN',
        brandName: 'BrandWithoutStore',
        brandLogoUrl: null,
        primaryStoreId: null,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const superUserId = `super_${stamp}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${stamp}`,
        userId: superUserId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )

    const list = await jsonFetch(`${ctx.base}/api/v1/platform/tenants?page=1&pageSize=100`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(list.resp.status, 200)
    const withStore = list.json.data.list.find((t) => t.tenantId === tenantWithStoreId)
    const withoutStore = list.json.data.list.find((t) => t.tenantId === tenantWithoutStoreId)
    assert.ok(withStore, 'tenant with primary store should be present')
    assert.ok(withoutStore, 'tenant without primary store should be present')
    assert.equal(withStore.primaryStoreId, tenantWithStoreStoreId)
    assert.equal(withStore.primaryStoreName, '主门店名称')
    assert.equal(withoutStore.primaryStoreId, null)
    assert.equal(withoutStore.primaryStoreName, null)
  })
})
