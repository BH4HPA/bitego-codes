const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, platformAdminAuthz, storeAdminAuthz } = require('./testUtils')

test('platform branding: public GET and SUPER_ADMIN PUT', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope

    const r0 = await jsonFetch(`${ctx.base}/api/v1/platform/branding`)
    assert.equal(r0.resp.status, 200)
    assert.ok(r0.json.data.platformName)

    const userId = `super_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r1 = await jsonFetch(`${ctx.base}/api/v1/platform/branding`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(token), 'content-type': 'application/json' },
      body: JSON.stringify({ platformName: 'P1', platformLogoUrl: null })
    })
    assert.equal(r1.resp.status, 200)
    assert.equal(r1.json.data.platformName, 'P1')

    const r2 = await jsonFetch(`${ctx.base}/api/v1/platform/branding`)
    assert.equal(r2.resp.status, 200)
    assert.equal(r2.json.data.platformName, 'P1')
  })
})

test('dashboard overview is scoped by active store', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Store = require('../dist/entities/Store').Store
    const Table = require('../dist/entities/Table').Table

    const tenantId = `t_${Date.now()}`
    const storeA = `sa_${Date.now()}`
    const storeB = `sb_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: storeA,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'A',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: storeB,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'B',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const tableRepo = ctx.AppDataSource.getRepository(Table)
    await tableRepo.save(
      tableRepo.create({
        tableId: `tbl_${Date.now()}_a`,
        storeId: storeA,
        code: 'A01',
        status: 'FREE',
        sessionVersion: 1,
        sessionClosedAt: null,
        qrcodeUrl: null
      })
    )
    await tableRepo.save(
      tableRepo.create({
        tableId: `tbl_${Date.now()}_b`,
        storeId: storeB,
        code: 'B01',
        status: 'FREE',
        sessionVersion: 1,
        sessionClosedAt: null,
        qrcodeUrl: null
      })
    )

    const userId = `u_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId: storeA,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r = await jsonFetch(`${ctx.base}/api/v1/dashboard/overview`, {
      headers: storeAdminAuthz(token, tenantId, storeA)
    })
    assert.equal(r.resp.status, 200)
    const ids = (r.json.data.tables || []).map((t) => t.tableId)
    assert.equal(ids.length, 1)
    assert.ok(String(ids[0]).includes('_a'))
  })
})

test('STORE_ADMIN cannot edit shared master data but can change good status', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Good = require('../dist/entities/Good').Good

    const tenantId = `t_${Date.now()}`
    const storeId = `s_${Date.now()}`
    const primaryStoreId = `sp_${Date.now()}`
    const userId = `u_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
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
        name: 'P',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'S',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const r1 = await jsonFetch(`${ctx.base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: '饮品', sort: 10 })
    })
    assert.equal(r1.resp.status, 403)

    const goodRepo = ctx.AppDataSource.getRepository(Good)
    const goodId = `good_${Date.now()}`
    await goodRepo.save(
      goodRepo.create({
        goodId,
        storeId,
        templateId: null,
        categoryId: `cat_${Date.now()}`,
        defaultSkuId: null,
        name: '美式咖啡',
        description: null,
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '100',
        status: 'ON_SHELF'
      })
    )

    const r2 = await jsonFetch(`${ctx.base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'OFF_SHELF' })
    })
    assert.equal(r2.resp.status, 200)

    const r3 = await jsonFetch(`${ctx.base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' })
    })
    assert.equal(r3.resp.status, 403)
  })
})
