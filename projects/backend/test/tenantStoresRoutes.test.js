const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, tenantAdminAuthz } = require('./testUtils')

test('tenant stores: tenant admin list/create/detail/delete with guards', async () => {
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
    const primaryStoreId = `s_${Date.now()}_p`
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

    const userId = `ta_${Date.now()}`
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

    const list0 = await jsonFetch(`${ctx.base}/api/v1/tenant/stores?page=1&pageSize=50`, {
      headers: tenantAdminAuthz(token, tenantId)
    })
    assert.equal(list0.resp.status, 200)
    assert.equal(list0.json.data.list.length, 1)

    const badPrimary = await jsonFetch(`${ctx.base}/api/v1/tenant/stores`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(token, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'S1', isPrimary: 1 })
    })
    assert.equal(badPrimary.resp.status, 400)

    const created = await jsonFetch(`${ctx.base}/api/v1/tenant/stores`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(token, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'S1', subName: 'B' })
    })
    assert.equal(created.resp.status, 200)
    const storeId = created.json.data.storeId
    assert.ok(storeId)

    const detail = await jsonFetch(`${ctx.base}/api/v1/tenant/stores/${encodeURIComponent(storeId)}`, {
      headers: tenantAdminAuthz(token, tenantId)
    })
    assert.equal(detail.resp.status, 200)
    assert.equal(detail.json.data.subName, 'B')

    const delPrimary = await jsonFetch(`${ctx.base}/api/v1/tenant/stores/${encodeURIComponent(primaryStoreId)}`, {
      method: 'DELETE',
      headers: tenantAdminAuthz(token, tenantId)
    })
    assert.equal(delPrimary.resp.status, 403)

    const del = await jsonFetch(`${ctx.base}/api/v1/tenant/stores/${encodeURIComponent(storeId)}`, {
      method: 'DELETE',
      headers: tenantAdminAuthz(token, tenantId)
    })
    assert.equal(del.resp.status, 200)

    const list1 = await jsonFetch(`${ctx.base}/api/v1/tenant/stores?page=1&pageSize=50`, {
      headers: tenantAdminAuthz(token, tenantId)
    })
    assert.equal(list1.resp.status, 200)
    assert.equal(
      list1.json.data.list.some((s) => s.storeId === storeId),
      false
    )
  })
})
