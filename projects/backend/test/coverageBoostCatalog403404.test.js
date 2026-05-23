const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('catalog routes return 404 when tenant and primary store are missing', async () => {
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

    const missingTenantId = `t_nope_${Date.now()}`
    const cat = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'tenant', 'x-tenant-id': missingTenantId },
      body: JSON.stringify({ name: 'C', subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
    })
    assert.equal(cat.resp.status, 404)

    const ssg = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'GET',
      headers: { ...authz, 'x-board': 'tenant', 'x-tenant-id': missingTenantId }
    })
    assert.equal(ssg.resp.status, 404)
  })
})

test('CHAIN branch store admin cannot create shared master data', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { AdminScope } = require('../dist/entities/AdminScope')

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)
    const scopeRepo = AppDataSource.getRepository(AdminScope)

    const tenantId = `t_${Date.now()}`
    const primaryStoreId = `store_primary_${Date.now()}`
    const branchStoreId = `store_branch_${Date.now()}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'B',
        brandLogoUrl: null,
        primaryStoreId,
        status: 'ACTIVE',
        lastSyncedChangeId: 0,
        lastSyncedAt: null
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: primaryStoreId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'Primary',
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
        name: 'Branch',
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
        storeId: branchStoreId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authz = await getAuthz(base, 'ADMIN', storeAdminId)

    const cat = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: {
        ...authz,
        'content-type': 'application/json',
        'x-board': 'store',
        'x-tenant-id': tenantId,
        'x-store-id': branchStoreId
      },
      body: JSON.stringify({ name: 'C', subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
    })
    assert.equal(cat.resp.status, 403)

    const optId = `o_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const ssg = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: {
        ...authz,
        'content-type': 'application/json',
        'x-board': 'store',
        'x-tenant-id': tenantId,
        'x-store-id': branchStoreId
      },
      body: JSON.stringify({
        name: '加料',
        isRequired: false,
        minSelection: 0,
        maxSelection: 1,
        options: [{ id: optId, name: '珍珠', priceCents: 100 }]
      })
    })
    assert.equal(ssg.resp.status, 403)
  })
})
