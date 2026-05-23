const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, platformAdminAuthz, storeAdminAuthz } = require('./testUtils')

test('platform branding validation and forbidden paths', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const PlatformConfig = require('../dist/entities/PlatformConfig').PlatformConfig
    const Store = require('../dist/entities/Store').Store

    const userId = `sa_${Date.now()}`
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

    const bad = await jsonFetch(`${ctx.base}/api/v1/platform/branding`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(token), 'content-type': 'application/json' },
      body: JSON.stringify({ platformName: '' })
    })
    assert.equal(bad.resp.status, 400)

    const storeId = `s_${Date.now()}`
    const tenantId = `t_${Date.now()}`
    const storeRepo = ctx.AppDataSource.getRepository(Store)
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

    const u2 = `u_${Date.now()}`
    const t2 = await getDevToken(ctx.base, 'ADMIN', u2)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_2`,
        userId: u2,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )
    const forbid = await jsonFetch(`${ctx.base}/api/v1/platform/branding`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(t2, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ platformName: 'X' })
    })
    assert.equal(forbid.resp.status, 403)

    const pcRepo = ctx.AppDataSource.getRepository(PlatformConfig)
    await pcRepo.update({ configId: 'platform_default' }, { platformName: '' })
    const r = await jsonFetch(`${ctx.base}/api/v1/platform/branding`)
    assert.equal(r.resp.status, 200)
    assert.equal(r.json.data.platformName, 'BiteGo 点点餐')
  })
})

test('tenant admin can CRUD categories on primary store and reorder goods', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Good = require('../dist/entities/Good').Good
    const GoodCategory = require('../dist/entities/GoodCategory').GoodCategory

    const tenantId = `t_${Date.now()}`
    const storeId = `p_${Date.now()}`
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'SINGLE',
        brandName: 'P',
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
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const c1 = await jsonFetch(`${ctx.base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: '饮品', sort: 10 })
    })
    assert.equal(c1.resp.status, 201)
    const categoryId = c1.json.data.categoryId

    const c2 = await jsonFetch(`${ctx.base}/api/v1/categories/${categoryId}`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ subtitle: 'S' })
    })
    assert.equal(c2.resp.status, 200)

    const goodRepo = ctx.AppDataSource.getRepository(Good)
    const gcRepo = ctx.AppDataSource.getRepository(GoodCategory)
    const g1 = await goodRepo.save(
      goodRepo.create({
        goodId: `g_${Date.now()}_1`,
        storeId,
        templateId: null,
        categoryId,
        defaultSkuId: null,
        name: 'A',
        description: null,
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '100',
        status: 'OFF_SHELF'
      })
    )
    const g2 = await goodRepo.save(
      goodRepo.create({
        goodId: `g_${Date.now()}_2`,
        storeId,
        templateId: null,
        categoryId,
        defaultSkuId: null,
        name: 'B',
        description: null,
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '100',
        status: 'OFF_SHELF'
      })
    )
    await gcRepo.save(gcRepo.create({ storeId, goodId: g1.goodId, categoryId, sort: 10 }))
    await gcRepo.save(gcRepo.create({ storeId, goodId: g2.goodId, categoryId, sort: 0 }))

    const c3 = await jsonFetch(`${ctx.base}/api/v1/categories/${categoryId}/goods/reorder`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ goodIds: [g2.goodId, g1.goodId] })
    })
    assert.equal(c3.resp.status, 200)

    const c4 = await jsonFetch(`${ctx.base}/api/v1/categories/${categoryId}`, {
      method: 'DELETE',
      headers: storeAdminAuthz(token, tenantId, storeId)
    })
    assert.equal(c4.resp.status, 200)
  })
})

test('table public API includes store info and only issues sessionToken when wasFree', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const Table = require('../dist/entities/Table').Table

    const tenantId = `t_${Date.now()}`
    const storeId = `s_${Date.now()}`
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: '门店A',
        logoUrl: 'l',
        phone: 'p',
        address: 'a',
        description: 'd'
      })
    )
    const tableRepo = ctx.AppDataSource.getRepository(Table)
    const tableId = `tbl_${Date.now()}`
    await tableRepo.save(
      tableRepo.create({
        tableId,
        storeId,
        code: 'A01',
        status: 'FREE',
        sessionVersion: 1,
        sessionClosedAt: null,
        qrcodeUrl: null
      })
    )

    const r1 = await jsonFetch(`${ctx.base}/api/v1/tables/${tableId}`)
    assert.equal(r1.resp.status, 200)
    assert.equal(Boolean(r1.json.data.wasFree), true)
    assert.ok(r1.json.data.sessionToken)
    assert.equal(r1.json.data.storeId, storeId)
    assert.ok(r1.json.data.store)
    assert.equal(r1.json.data.store.name, '门店A')

    const r2 = await jsonFetch(`${ctx.base}/api/v1/tables/${tableId}`)
    assert.equal(r2.resp.status, 200)
    assert.equal(Boolean(r2.json.data.wasFree), false)
    assert.ok(r2.json.data.sessionToken)
  })
})
