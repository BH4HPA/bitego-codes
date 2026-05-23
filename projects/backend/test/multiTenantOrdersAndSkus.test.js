const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('multi-tenant: orders/skus are scoped by store context for admins', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store
    const Table = require('../dist/entities/Table').Table
    const Order = require('../dist/entities/Order').Order
    const Good = require('../dist/entities/Good').Good
    const SKU = require('../dist/entities/SKU').SKU

    const tenantId = `t_${Date.now()}`
    const storeIdA = `s_${Date.now()}_a`
    const storeIdB = `s_${Date.now()}_b`

    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId: storeIdA,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: storeIdA,
        tenantId,
        isPrimary: 1,
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
        storeId: storeIdB,
        tenantId,
        isPrimary: 0,
        subName: 'B',
        name: 'B',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const tableRepo = ctx.AppDataSource.getRepository(Table)
    const tableA = `tbl_${Date.now()}_a`
    const tableB = `tbl_${Date.now()}_b`
    await tableRepo.save(tableRepo.create({ tableId: tableA, storeId: storeIdA, code: 'A01', status: 'FREE' }))
    await tableRepo.save(tableRepo.create({ tableId: tableB, storeId: storeIdB, code: 'B01', status: 'FREE' }))

    const orderRepo = ctx.AppDataSource.getRepository(Order)
    const orderAId = `ord_${Date.now()}_a`
    const orderBId = `ord_${Date.now()}_b`
    await orderRepo.save(
      orderRepo.create({
        orderId: orderAId,
        orderNo: `NOA_${Date.now()}`,
        storeId: storeIdA,
        tableId: tableA,
        tableSessionVersion: 1,
        userId: `u_${Date.now()}_c`,
        status: 'Paid',
        paymentMethod: 'WECHAT',
        remark: null,
        totalAmount: '100',
        paidAmount: '100',
        refundedAmount: null,
        paidAt: new Date(),
        completedAt: null,
        canceledAt: null,
        refundedAt: null
      })
    )
    await orderRepo.save(
      orderRepo.create({
        orderId: orderBId,
        orderNo: `NOB_${Date.now()}`,
        storeId: storeIdB,
        tableId: tableB,
        tableSessionVersion: 1,
        userId: `u_${Date.now()}_d`,
        status: 'Paid',
        paymentMethod: 'WECHAT',
        remark: null,
        totalAmount: '200',
        paidAmount: '200',
        refundedAmount: null,
        paidAt: new Date(),
        completedAt: null,
        canceledAt: null,
        refundedAt: null
      })
    )

    const goodRepo = ctx.AppDataSource.getRepository(Good)
    const skuRepo = ctx.AppDataSource.getRepository(SKU)
    const goodAId = `good_${Date.now()}_a`
    const goodBId = `good_${Date.now()}_b`
    await goodRepo.save(
      goodRepo.create({
        goodId: goodAId,
        storeId: storeIdA,
        templateId: null,
        categoryId: 'cat_default',
        defaultSkuId: null,
        name: 'GA',
        description: '',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '0',
        status: 'OFF_SHELF'
      })
    )
    await goodRepo.save(
      goodRepo.create({
        goodId: goodBId,
        storeId: storeIdB,
        templateId: null,
        categoryId: 'cat_default',
        defaultSkuId: null,
        name: 'GB',
        description: '',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '0',
        status: 'OFF_SHELF'
      })
    )
    const skuAId = `sku_${Date.now()}_a`
    const skuBId = `sku_${Date.now()}_b`
    await skuRepo.save(
      skuRepo.create({
        skuId: skuAId,
        goodId: goodAId,
        specCombination: 'default',
        specKey: null,
        specSignature: null,
        price: '0',
        stock: 0,
        status: 'OFF_SHELF'
      })
    )
    await skuRepo.save(
      skuRepo.create({
        skuId: skuBId,
        goodId: goodBId,
        specCombination: 'default',
        specKey: null,
        specSignature: null,
        price: '0',
        stock: 0,
        status: 'OFF_SHELF'
      })
    )

    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    const adminAUserId = `adm_${Date.now()}_a`
    const adminAToken = await getDevToken(ctx.base, 'ADMIN', adminAUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: adminAUserId,
        tenantId,
        storeId: storeIdA,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const listOrdersA = await jsonFetch(`${ctx.base}/api/v1/orders?page=1&pageSize=50`, {
      headers: storeAdminAuthz(adminAToken, tenantId, storeIdA)
    })
    assert.equal(listOrdersA.resp.status, 200)
    assert.equal(listOrdersA.json.data.list.length, 1)
    assert.equal(listOrdersA.json.data.list[0].orderId, orderAId)

    const forbidOrderB = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderBId)}`, {
      headers: storeAdminAuthz(adminAToken, tenantId, storeIdA)
    })
    assert.equal(forbidOrderB.resp.status, 404)

    const updateB = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderBId)}/status`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(adminAToken, tenantId, storeIdA), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Making', reason: 'x' })
    })
    assert.equal(updateB.resp.status, 404)

    const updateA = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderAId)}/status`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(adminAToken, tenantId, storeIdA), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Making', reason: 'x' })
    })
    assert.equal(updateA.resp.status, 200)

    const logsA = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderAId)}/status-logs`, {
      headers: storeAdminAuthz(adminAToken, tenantId, storeIdA)
    })
    assert.equal(logsA.resp.status, 200)
    assert.ok(logsA.json.data.list.length >= 1)

    const skusA = await jsonFetch(`${ctx.base}/api/v1/skus?page=1&pageSize=50`, {
      headers: storeAdminAuthz(adminAToken, tenantId, storeIdA)
    })
    assert.equal(skusA.resp.status, 200)
    assert.equal(
      skusA.json.data.list.some((s) => s.skuId === skuAId),
      true
    )
    assert.equal(
      skusA.json.data.list.some((s) => s.skuId === skuBId),
      false
    )

    const exportA = await jsonFetch(`${ctx.base}/api/v1/orders/export?format=csv`, {
      headers: storeAdminAuthz(adminAToken, tenantId, storeIdA)
    })
    assert.equal(exportA.resp.status, 200)
    assert.ok(exportA.text.includes('orderNo'))
    assert.ok(exportA.text.includes('NOA_'))
  })
})
