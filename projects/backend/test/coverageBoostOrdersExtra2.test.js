const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('coverage: orders export/refunds/status invalid branches', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store
    const Order = require('../dist/entities/Order').Order

    const tenantId = `t_${Date.now()}`
    const storeId = `s_${Date.now()}`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId: storeId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )
    const storeRepo = ctx.AppDataSource.getRepository(Store)
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

    const adminUserId = `adm_${Date.now()}`
    const adminToken = await getDevToken(ctx.base, 'ADMIN', adminUserId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: adminUserId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const orderRepo = ctx.AppDataSource.getRepository(Order)
    const orderId = `ord_${Date.now()}`
    await orderRepo.save(
      orderRepo.create({
        orderId,
        orderNo: `NO_${Date.now()}`,
        storeId,
        tableId: null,
        tableSessionVersion: null,
        userId: `c_${Date.now()}`,
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

    const badStatus = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(adminToken, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Paid' })
    })
    assert.equal(badStatus.resp.status, 400)

    const badExport = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderId)}/export?format=bad`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(badExport.resp.status, 400)

    const okExportXls = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderId)}/export?format=xls`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(okExportXls.resp.status, 200)
    assert.ok(okExportXls.text.includes('\t'))

    const logs404 = await jsonFetch(`${ctx.base}/api/v1/orders/ord_missing_${Date.now()}/status-logs`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(logs404.resp.status, 404)

    const refunds404 = await jsonFetch(`${ctx.base}/api/v1/orders/ord_missing_${Date.now()}/refunds`, {
      method: 'POST',
      headers: {
        ...storeAdminAuthz(adminToken, tenantId, storeId),
        'content-type': 'application/json',
        'x-request-id': `rid_${Date.now()}`
      },
      body: JSON.stringify({ reason: 'x' })
    })
    assert.equal(refunds404.resp.status, 404)

    const listRefunds0 = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderId)}/refunds`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(listRefunds0.resp.status, 200)
    assert.ok(Array.isArray(listRefunds0.json.data.list))

    const refundReq = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderId)}/refunds`, {
      method: 'POST',
      headers: {
        ...storeAdminAuthz(adminToken, tenantId, storeId),
        'content-type': 'application/json',
        'x-request-id': `rid_${Date.now()}`
      },
      body: JSON.stringify({ reason: 'test' })
    })
    assert.equal(refundReq.resp.status, 202)
  })
})
