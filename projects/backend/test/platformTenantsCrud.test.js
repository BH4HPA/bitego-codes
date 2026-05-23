const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, bearerAuthz, platformAdminAuthz } = require('./testUtils')

test('platform tenants: super admin can create/update/delete; others forbidden; delete cascades', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope

    const token0 = await getDevToken(ctx.base, 'ADMIN', `u_${Date.now()}_noscope`)
    const forbid0 = await jsonFetch(`${ctx.base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...bearerAuthz(token0), 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CHAIN', brandName: 'B' })
    })
    assert.equal(forbid0.resp.status, 403)

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

    const bad1 = await jsonFetch(`${ctx.base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ brandName: 'B' })
    })
    assert.equal(bad1.resp.status, 400)

    const created = await jsonFetch(`${ctx.base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CHAIN', brandName: 'Brand', brandLogoUrl: null })
    })
    assert.equal(created.resp.status, 200)
    const tenantId = created.json.data.tenantId
    const primaryStoreId = created.json.data.primaryStoreId
    assert.ok(tenantId)
    assert.ok(primaryStoreId)

    const detail1 = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(detail1.resp.status, 200)
    assert.equal(detail1.json.data.primaryStoreId, primaryStoreId)

    const badUpdate = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'SINGLE' })
    })
    assert.equal(badUpdate.resp.status, 400)

    const updated = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ brandName: 'Brand2', status: 'DISABLED', brandLogoUrl: 'https://x/logo.png' })
    })
    assert.equal(updated.resp.status, 200)

    const detail2 = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(detail2.resp.status, 200)
    assert.equal(detail2.json.data.brandName, 'Brand2')
    assert.equal(detail2.json.data.status, 'DISABLED')

    const targetUserId = `u_${Date.now()}_storeadmin`
    const createScope = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId, tenantId, role: 'STORE_ADMIN', storeId: primaryStoreId })
    })
    assert.equal(createScope.resp.status, 200)

    const listBeforeDel = await jsonFetch(
      `${ctx.base}/api/v1/admin/scopes?userId=${encodeURIComponent(targetUserId)}`,
      { headers: platformAdminAuthz(superToken) }
    )
    assert.equal(listBeforeDel.resp.status, 200)
    assert.equal(listBeforeDel.json.data.list.length, 1)

    const del = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(del.resp.status, 200)

    const detail404 = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(detail404.resp.status, 404)

    const storeList = await jsonFetch(
      `${ctx.base}/api/v1/platform/stores?tenantId=${encodeURIComponent(tenantId)}&page=1&pageSize=50`,
      { headers: platformAdminAuthz(superToken) }
    )
    assert.equal(storeList.resp.status, 200)
    assert.equal(storeList.json.data.list.length, 0)

    const listAfterDel = await jsonFetch(`${ctx.base}/api/v1/admin/scopes?userId=${encodeURIComponent(targetUserId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(listAfterDel.resp.status, 200)
    assert.equal(listAfterDel.json.data.list.length, 0)

    const delDefault = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/store_default`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(delDefault.resp.status, 403)
  })
})
