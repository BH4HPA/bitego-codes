const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

async function seedTenantStore({ AppDataSource, tenantId, storeId, type }) {
  const { Tenant } = require('../dist/entities/Tenant')
  const { Store } = require('../dist/entities/Store')
  const tenantRepo = AppDataSource.getRepository(Tenant)
  const storeRepo = AppDataSource.getRepository(Store)
  await tenantRepo.save(
    tenantRepo.create({
      tenantId,
      type,
      brandName: type === 'SINGLE' ? 'Shop' : 'Brand',
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
      name: 'S',
      logoUrl: '',
      phone: '',
      address: '',
      description: ''
    })
  )
}

async function seedAdminScope({ AppDataSource, userId, tenantId, storeId, role }) {
  const { AdminScope } = require('../dist/entities/AdminScope')
  const repo = AppDataSource.getRepository(AdminScope)
  await repo.save(
    repo.create({
      scopeId: `sc_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      userId,
      tenantId,
      storeId,
      role,
      status: 'ACTIVE'
    })
  )
}

test('CHAIN tenant admin can create categories/spec/goods without x-store-id', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const tenantId = `t_${Date.now()}`
    const storeId = `store_${Date.now()}`
    await seedTenantStore({ AppDataSource, tenantId, storeId, type: 'CHAIN' })

    const userId = `admin_t_${Date.now()}`
    await seedAdminScope({ AppDataSource, userId, tenantId, storeId: null, role: 'TENANT_ADMIN' })
    const authz = await getAuthz(base, 'ADMIN', userId)

    const cat = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'tenant', 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'C1', subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
    })
    assert.equal(cat.resp.status, 201)
    const categoryId = cat.json.data.categoryId
    assert.ok(categoryId)

    const optId = `o_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const ssg = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'tenant', 'x-tenant-id': tenantId },
      body: JSON.stringify({
        name: '加料',
        isRequired: false,
        minSelection: 0,
        maxSelection: 1,
        options: [{ id: optId, name: '珍珠', priceCents: 100 }]
      })
    })
    assert.equal(ssg.resp.status, 201)

    const good = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-board': 'tenant', 'x-tenant-id': tenantId },
      body: JSON.stringify({ categoryId, name: 'G1', status: 'OFF_SHELF', basePriceCents: 100 })
    })
    assert.equal(good.resp.status, 201)
  })
})

test('SINGLE store admin can create categories/spec/goods', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const tenantId = `t_${Date.now()}`
    const storeId = `store_${Date.now()}`
    await seedTenantStore({ AppDataSource, tenantId, storeId, type: 'SINGLE' })

    const userId = `admin_s_${Date.now()}`
    await seedAdminScope({ AppDataSource, userId, tenantId, storeId, role: 'STORE_ADMIN' })
    const authz = await getAuthz(base, 'ADMIN', userId)

    const cat = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: {
        ...authz,
        'content-type': 'application/json',
        'x-board': 'store',
        'x-tenant-id': tenantId,
        'x-store-id': storeId
      },
      body: JSON.stringify({ name: 'C1', subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
    })
    assert.equal(cat.resp.status, 201)
    const categoryId = cat.json.data.categoryId
    assert.ok(categoryId)

    const optId = `o_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const ssg = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: {
        ...authz,
        'content-type': 'application/json',
        'x-board': 'store',
        'x-tenant-id': tenantId,
        'x-store-id': storeId
      },
      body: JSON.stringify({
        name: '加料',
        isRequired: false,
        minSelection: 0,
        maxSelection: 1,
        options: [{ id: optId, name: '珍珠', priceCents: 100 }]
      })
    })
    assert.equal(ssg.resp.status, 201)

    const good = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: {
        ...authz,
        'content-type': 'application/json',
        'x-board': 'store',
        'x-tenant-id': tenantId,
        'x-store-id': storeId
      },
      body: JSON.stringify({ categoryId, name: 'G1', status: 'OFF_SHELF', basePriceCents: 100 })
    })
    assert.equal(good.resp.status, 201, good.text || JSON.stringify(good.json))
  })
})
