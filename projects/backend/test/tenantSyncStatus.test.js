const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('tenant sync status reflects dirty changes and clears after successful batch', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const { runStoreSyncWorkerOnce } = require('../dist/workers/storeSyncWorker')

    const tenantId = `t_${Date.now()}`
    const primaryStoreId = `p_${Date.now()}`
    const subStoreId = `c_${Date.now()}`

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
        storeId: subStoreId,
        tenantId,
        isPrimary: 0,
        subName: 'C',
        name: 'C',
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

    const adminUserId = `admin_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', adminUserId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: adminUserId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const s0 = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: storeAdminAuthz(token, tenantId, primaryStoreId)
    })
    assert.equal(s0.resp.status, 200)
    assert.equal(Boolean(s0.json.data.dirty), false)

    const c1 = await jsonFetch(`${ctx.base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: `饮品_${Date.now()}`, sort: 10 })
    })
    assert.equal(c1.resp.status, 201)

    const s1 = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: storeAdminAuthz(token, tenantId, primaryStoreId)
    })
    assert.equal(s1.resp.status, 200)
    assert.equal(Boolean(s1.json.data.dirty), true)
    assert.ok(Number(s1.json.data.summary.CATEGORY || 0) >= 1)
    assert.ok(Array.isArray(s1.json.data.recentChanges))
    assert.ok(s1.json.data.recentChanges.length >= 1)

    const enqueue = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(enqueue.resp.status, 202)
    await runStoreSyncWorkerOnce()

    const s2 = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: storeAdminAuthz(token, tenantId, primaryStoreId)
    })
    assert.equal(s2.resp.status, 200)
    assert.equal(Boolean(s2.json.data.dirty), false)
    assert.ok(s2.json.data.jobSummary)
    assert.ok(s2.json.data.jobSummary.lastSyncedAt)
  })
})
