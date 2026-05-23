const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('primary store edits generate store_sync_changes and status summary', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const StoreSyncChange = require('../dist/entities/StoreSyncChange').StoreSyncChange

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

    const userId = `admin_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const c1 = await jsonFetch(`${ctx.base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: `饮品_${Date.now()}`, sort: 10 })
    })
    assert.equal(c1.resp.status, 201)
    const categoryId = c1.json.data.categoryId

    const c2 = await jsonFetch(`${ctx.base}/api/v1/categories/${categoryId}`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: JSON.stringify({ subtitle: 'S' })
    })
    assert.equal(c2.resp.status, 200)

    const c3 = await jsonFetch(`${ctx.base}/api/v1/categories/${categoryId}`, {
      method: 'DELETE',
      headers: storeAdminAuthz(token, tenantId, primaryStoreId)
    })
    assert.equal(c3.resp.status, 200)

    const g1 = await jsonFetch(`${ctx.base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '温度',
        description: null,
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        defaultOptionIds: [],
        options: [
          { optionId: `o_${Date.now()}_1`, name: '热', priceCents: '0', sort: 0 },
          { optionId: `o_${Date.now()}_2`, name: '冰', priceCents: '0', sort: 0 }
        ]
      })
    })
    assert.equal(g1.resp.status, 201)
    const sharedSpecGroupId = g1.json.data.sharedSpecGroupId

    const g2 = await jsonFetch(`${ctx.base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '温度',
        description: 'd',
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        defaultOptionIds: [],
        options: [{ optionId: `o_${Date.now()}_1u`, name: '热', priceCents: '0', sort: 0 }]
      })
    })
    assert.equal(g2.resp.status, 200)

    const g3 = await jsonFetch(`${ctx.base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`, {
      method: 'DELETE',
      headers: storeAdminAuthz(token, tenantId, primaryStoreId)
    })
    assert.equal(g3.resp.status, 200)

    const changeRepo = ctx.AppDataSource.getRepository(StoreSyncChange)
    const changes = await changeRepo.find({ where: { tenantId, sourceStoreId: primaryStoreId } })
    assert.ok(changes.length >= 4)

    const s = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog/status`, {
      headers: storeAdminAuthz(token, tenantId, primaryStoreId)
    })
    assert.equal(s.resp.status, 200)
    assert.equal(Boolean(s.json.data.dirty), true)
    assert.ok(Number(s.json.data.summary.CATEGORY || 0) >= 1)
    assert.ok(Number(s.json.data.summary.SHARED_SPEC_GROUP || 0) >= 1)
  })
})
