const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('catalog routes resolve primary store from tenant primaryStoreId', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { AdminScope } = require('../dist/entities/AdminScope')

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)
    const scopeRepo = AppDataSource.getRepository(AdminScope)

    const tenantId = `t_missing_${Date.now()}`
    const storeId = `store_missing_${Date.now()}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'SINGLE',
        brandName: 'S',
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

    const tenantAdminId = `admin_t_${Date.now()}`
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_t`,
        userId: tenantAdminId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authzTenant = await getAuthz(base, 'ADMIN', tenantAdminId)

    const createdCat = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authzTenant, 'content-type': 'application/json', 'x-board': 'tenant', 'x-tenant-id': tenantId },
      body: JSON.stringify({ name: 'C', subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
    })
    assert.equal(createdCat.resp.status, 201)

    const optId = `o_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const createdSsg = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: { ...authzTenant, 'content-type': 'application/json', 'x-board': 'tenant', 'x-tenant-id': tenantId },
      body: JSON.stringify({
        name: '加料',
        isRequired: false,
        minSelection: 0,
        maxSelection: 1,
        options: [{ id: optId, name: '珍珠', priceCents: 100 }]
      })
    })
    assert.equal(createdSsg.resp.status, 201)

    const storeAdminId = `admin_s_${Date.now()}`
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_s`,
        userId: storeAdminId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )
    const authzStore = await getAuthz(base, 'ADMIN', storeAdminId)
    const storeAdminCat = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: {
        ...authzStore,
        'content-type': 'application/json',
        'x-board': 'store',
        'x-tenant-id': tenantId,
        'x-store-id': storeId
      },
      body: JSON.stringify({ name: 'C2', subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
    })
    assert.equal(storeAdminCat.resp.status, 201)
  })
})

test('catalog list routes accept x-tenant-id and resolve to tenant primary store', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { Category } = require('../dist/entities/Category')
    const { Good } = require('../dist/entities/Good')

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)
    const catRepo = AppDataSource.getRepository(Category)
    const goodRepo = AppDataSource.getRepository(Good)

    const tenantId = `t_real_${Date.now()}`
    const storeId = `store_real_${Date.now()}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'B',
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
    await catRepo.save(
      catRepo.create({
        categoryId: `cat_${Date.now()}`,
        storeId,
        templateId: null,
        name: '分类',
        subtitle: null,
        badgeText: null,
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await goodRepo.save(
      goodRepo.create({
        goodId: `good_${Date.now()}`,
        storeId,
        templateId: null,
        categoryId: 'cat_test',
        defaultSkuId: null,
        name: '菜品',
        description: '',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '100',
        status: 'ON_SHELF'
      })
    )

    const cats = await jsonFetch(`${base}/api/v1/categories?page=1&pageSize=20`, {
      method: 'GET',
      headers: { 'x-tenant-id': tenantId }
    })
    assert.equal(cats.resp.status, 200)
    assert.ok(cats.json.data.list.some((c) => c.name === '分类'))

    const goods = await jsonFetch(`${base}/api/v1/goods?page=1&pageSize=20`, {
      method: 'GET',
      headers: { 'x-tenant-id': tenantId }
    })
    assert.equal(goods.resp.status, 200)
    assert.ok(goods.json.data.list.some((g) => g.name === '菜品'))
  })
})
