const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, platformAdminAuthz, storeAdminAuthz } = require('./testUtils')

test('platform stores: super admin list/create/update/delete and non-super forbidden', async () => {
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

    const superUserId = `super_${Date.now()}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
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

    const created1 = await jsonFetch(`${ctx.base}/api/v1/platform/stores`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, name: 'S1', isPrimary: 1 })
    })
    assert.equal(created1.resp.status, 200)
    const storeId1 = created1.json.data.storeId
    assert.ok(storeId1)

    const created2 = await jsonFetch(`${ctx.base}/api/v1/platform/stores`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, name: 'S2', isPrimary: 0 })
    })
    assert.equal(created2.resp.status, 200)
    const storeId2 = created2.json.data.storeId
    assert.ok(storeId2)

    const list1 = await jsonFetch(
      `${ctx.base}/api/v1/platform/stores?tenantId=${encodeURIComponent(tenantId)}&page=1&pageSize=50`,
      {
        headers: platformAdminAuthz(superToken)
      }
    )
    assert.equal(list1.resp.status, 200)
    assert.equal(list1.json.data.list.length, 2)
    assert.equal(
      list1.json.data.list.some((s) => s.storeId === storeId1),
      true
    )
    assert.equal(
      list1.json.data.list.some((s) => s.storeId === storeId2),
      true
    )

    const tenantAfterPrimary = await tenantRepo.findOne({ where: { tenantId } })
    assert.equal(tenantAfterPrimary.primaryStoreId, storeId1)

    const promote = await jsonFetch(`${ctx.base}/api/v1/platform/stores/${encodeURIComponent(storeId2)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ isPrimary: 1, subName: 'B' })
    })
    assert.equal(promote.resp.status, 200)

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    const s1 = await storeRepo.findOne({ where: { storeId: storeId1 } })
    const s2 = await storeRepo.findOne({ where: { storeId: storeId2 } })
    assert.equal(s1.isPrimary, 0)
    assert.equal(s2.isPrimary, 1)

    const tenantAfterPromote = await tenantRepo.findOne({ where: { tenantId } })
    assert.equal(tenantAfterPromote.primaryStoreId, storeId2)

    const detail = await jsonFetch(`${ctx.base}/api/v1/platform/stores/${encodeURIComponent(storeId2)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(detail.resp.status, 200)
    assert.equal(detail.json.data.subName, 'B')

    const del = await jsonFetch(`${ctx.base}/api/v1/platform/stores/${encodeURIComponent(storeId2)}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(del.resp.status, 200)

    const tenantAfterDel = await tenantRepo.findOne({ where: { tenantId } })
    assert.equal(tenantAfterDel.primaryStoreId, null)

    const storeAdminUserId = `sa_${Date.now()}`
    const storeAdminToken = await getDevToken(ctx.base, 'ADMIN', storeAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storeAdminUserId,
        tenantId,
        storeId: storeId1,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const forbid = await jsonFetch(`${ctx.base}/api/v1/platform/stores?page=1&pageSize=1`, {
      headers: storeAdminAuthz(storeAdminToken, tenantId, storeId1)
    })
    assert.equal(forbid.resp.status, 403)
  })
})
