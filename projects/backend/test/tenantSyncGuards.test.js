const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, bearerAuthz, storeAdminAuthz, tenantAdminAuthz } = require('./testUtils')

test('tenant sync status guards: super admin without store context returns 400', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)

    const userId = `super_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: bearerAuthz(token)
    })
    assert.equal(r.resp.status, 400)
  })
})

test('tenant sync status guards: non-primary store returns 403 and missing tenant returns 404', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const AdminScope = require('../dist/entities/AdminScope').AdminScope

    const tenantId = `t_${Date.now()}`
    const s1 = `s1_${Date.now()}`
    const s2 = `s2_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: s1,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'S1',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: s2,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'S2',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const userId = `ta_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r1 = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: storeAdminAuthz(token, tenantId, s1)
    })
    assert.equal(r1.resp.status, 403)

    const r2 = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: storeAdminAuthz(token, tenantId, s2)
    })
    assert.equal(r2.resp.status, 404)
  })
})

test('tenant sync trigger returns enqueued=0 when no target stores', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant
    const AdminScope = require('../dist/entities/AdminScope').AdminScope

    const tenantId = `t_${Date.now()}`
    const primaryStoreId = `p_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: primaryStoreId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'P',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const userId = `ta_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(r.resp.status, 202)
    assert.equal(Number(r.json.data.enqueued || 0), 0)
  })
})

test('tenant sync trigger from tenant board resolves primary store automatically', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant
    const AdminScope = require('../dist/entities/AdminScope').AdminScope

    const tenantId = `t_${Date.now()}`
    const primaryStoreId = `p_${Date.now()}`
    const branchStoreId = `b_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: primaryStoreId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'P',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: branchStoreId,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'B',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const userId = `ta_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const status = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: tenantAdminAuthz(token, tenantId)
    })
    assert.equal(status.resp.status, 200)

    const trigger = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(token, tenantId), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(trigger.resp.status, 202)
    assert.equal(Number(trigger.json.data.enqueued || 0), 1)
  })
})

test('tenant sync status requires tenant admin role', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant
    const AdminScope = require('../dist/entities/AdminScope').AdminScope

    const tenantId = `t_${Date.now()}`
    const primaryStoreId = `p_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: primaryStoreId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'P',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const userId = `sa_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId: primaryStoreId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: storeAdminAuthz(token, tenantId, primaryStoreId)
    })
    assert.equal(r.resp.status, 403)
  })
})
