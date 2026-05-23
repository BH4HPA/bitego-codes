const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('platform create SINGLE tenant does not create admin users/scopes', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { AdminScope } = require('../dist/entities/AdminScope')
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')

    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)

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

    const shopName = `Shop_${Date.now()}`
    const r = await jsonFetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ type: 'SINGLE', storeName: shopName, brandName: shopName })
    })
    assert.equal(r.resp.status, 200)
    assert.ok(r.json && r.json.success)
    assert.ok(r.json.data && r.json.data.tenantId)
    assert.equal(r.json.data.storeAdmin, undefined)
    assert.equal(r.json.data.tenantAdmin, undefined)

    const tenant = await tenantRepo.findOne({ where: { tenantId: r.json.data.tenantId } })
    assert.ok(tenant)
    assert.equal(tenant.type, 'SINGLE')
    assert.equal(tenant.brandName, shopName)
    assert.equal(tenant.brandLogoUrl, null)

    const store = await storeRepo.findOne({ where: { storeId: r.json.data.primaryStoreId } })
    assert.ok(store)
    assert.equal(store.tenantId, tenant.tenantId)
    assert.equal(store.isPrimary, 1)

    const createdScopes = await scopeRepo.find({ where: { tenantId: tenant.tenantId, status: 'ACTIVE' } })
    assert.equal(createdScopes.length, 0)
  })
})

test('platform stores rejects creating a second store under SINGLE tenant', async () => {
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

    const shopName = `Shop_${Date.now()}`
    const created = await jsonFetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ type: 'SINGLE', storeName: shopName, brandName: shopName })
    })
    assert.equal(created.resp.status, 200)
    const tenantId = created.json.data.tenantId

    const r2 = await jsonFetch(`${base}/api/v1/platform/stores`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'platform' },
      body: JSON.stringify({ tenantId, name: 'Another Store' })
    })
    assert.equal(r2.resp.status, 400)
  })
})

test('admin scopes me includes tenantType and scopeLevel', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { AdminScope } = require('../dist/entities/AdminScope')
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')

    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)

    const tenantId = `t_${Date.now()}`
    const storeId = `store_${Date.now()}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'SINGLE',
        brandName: 'Shop',
        brandLogoUrl: null,
        primaryStoreId: storeId,
        status: 'ACTIVE',
        lastSyncedChangeId: 0,
        lastSyncedAt: null
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'Shop',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const storeAdminId = `admin_s_${Date.now()}`
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId: storeAdminId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authz = await getAuthz(base, 'ADMIN', storeAdminId)
    const r = await jsonFetch(`${base}/api/v1/admin/me/scopes`, {
      method: 'GET',
      headers: { ...authz, 'x-board': 'store', 'x-tenant-id': tenantId, 'x-store-id': storeId }
    })
    assert.equal(r.resp.status, 200)
    const row = r.json.data.list.find((x) => x.storeId === storeId)
    assert.ok(row)
    assert.equal(row.tenantType, 'SINGLE')
    assert.equal(row.scopeLevel, 'STORE')
  })
})
