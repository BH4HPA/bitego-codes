const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('platform tenants endpoints cover create/get/update/delete branches', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { AdminScope } = require('../dist/entities/AdminScope')
    const scopeRepo = AppDataSource.getRepository(AdminScope)

    const superId = `admin_sup_${Date.now()}`
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId: superId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authz = await getAuthz(base, 'ADMIN', superId)

    const bad = await jsonFetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ brandName: 'x' })
    })
    assert.equal(bad.resp.status, 400)

    const chain = await jsonFetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ type: 'CHAIN', brandName: `B_${Date.now()}` })
    })
    assert.equal(chain.resp.status, 200)
    assert.ok(chain.json.data.primaryStoreId)
    const chainTenantId = chain.json.data.tenantId
    assert.ok(chainTenantId)

    const singleName = `Shop_${Date.now()}`
    const single = await jsonFetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ type: 'SINGLE', brandName: singleName, storeName: singleName })
    })
    assert.equal(single.resp.status, 200)
    assert.ok(single.json.data.primaryStoreId)
    const singleTenantId = single.json.data.tenantId
    assert.ok(singleTenantId)

    const list1 = await jsonFetch(`${base}/api/v1/platform/tenants?page=1&pageSize=20`, {
      method: 'GET',
      headers: { ...authz, 'x-board': 'platform' }
    })
    assert.equal(list1.resp.status, 200)

    const detail = await jsonFetch(`${base}/api/v1/platform/tenants/${chainTenantId}`, {
      method: 'GET',
      headers: { ...authz, 'x-board': 'platform' }
    })
    assert.equal(detail.resp.status, 200)

    const detailBad = await jsonFetch(`${base}/api/v1/platform/tenants/%20`, {
      method: 'GET',
      headers: { ...authz, 'x-board': 'platform' }
    })
    assert.equal(detailBad.resp.status, 400)

    const upd = await jsonFetch(`${base}/api/v1/platform/tenants/${chainTenantId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ brandName: `B2_${Date.now()}` })
    })
    assert.equal(upd.resp.status, 200)

    const updReadonly = await jsonFetch(`${base}/api/v1/platform/tenants/${chainTenantId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ type: 'SINGLE' })
    })
    assert.equal(updReadonly.resp.status, 400)

    const updBadStatus = await jsonFetch(`${base}/api/v1/platform/tenants/${chainTenantId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ status: 'BAD' })
    })
    assert.equal(updBadStatus.resp.status, 400)

    const updDefaultForbidden = await jsonFetch(`${base}/api/v1/platform/tenants/store_default`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ brandName: `B_${Date.now()}` })
    })
    assert.equal(updDefaultForbidden.resp.status, 403)

    const delMissing = await jsonFetch(`${base}/api/v1/platform/tenants/t_missing_${Date.now()}`, {
      method: 'DELETE',
      headers: { ...authz, 'x-board': 'platform' }
    })
    assert.equal(delMissing.resp.status, 404)

    const delDefaultForbidden = await jsonFetch(`${base}/api/v1/platform/tenants/store_default`, {
      method: 'DELETE',
      headers: { ...authz, 'x-board': 'platform' }
    })
    assert.equal(delDefaultForbidden.resp.status, 403)

    const del = await jsonFetch(`${base}/api/v1/platform/tenants/${singleTenantId}`, {
      method: 'DELETE',
      headers: { ...authz, 'x-board': 'platform' }
    })
    assert.equal(del.resp.status, 200)

    const tenantAdminId = `admin_t_${Date.now()}`
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_t`,
        userId: tenantAdminId,
        tenantId: chainTenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authzTenant = await getAuthz(base, 'ADMIN', tenantAdminId)
    const forbidden = await jsonFetch(`${base}/api/v1/platform/tenants/${chainTenantId}`, {
      method: 'GET',
      headers: { ...authzTenant, 'x-board': 'platform' }
    })
    assert.equal(forbidden.resp.status, 400)
  })
})
