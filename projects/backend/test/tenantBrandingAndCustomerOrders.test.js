const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, tenantAdminAuthz, storeAdminAuthz, customerAuthz } = require('./testUtils')

test('tenant branding: tenant admin can read/write; store admin forbidden', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

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

    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    const tenantAdminUserId = `ta_${Date.now()}`
    const tenantAdminToken = await getDevToken(ctx.base, 'ADMIN', tenantAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: tenantAdminUserId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const get1 = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      headers: tenantAdminAuthz(tenantAdminToken, tenantId)
    })
    assert.equal(get1.resp.status, 200)
    assert.equal(get1.json.data.brandName, 'Brand')

    const put1 = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ brandName: 'Brand2', brandLogoUrl: 'https://x/logo.png' })
    })
    assert.equal(put1.resp.status, 200)

    const get2 = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      headers: tenantAdminAuthz(tenantAdminToken, tenantId)
    })
    assert.equal(get2.resp.status, 200)
    assert.equal(get2.json.data.brandName, 'Brand2')

    const storeAdminUserId = `sa_${Date.now()}`
    const storeAdminToken = await getDevToken(ctx.base, 'ADMIN', storeAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storeAdminUserId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const forbid = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      headers: storeAdminAuthz(storeAdminToken, tenantId, storeId)
    })
    assert.equal(forbid.resp.status, 403)
  })
})

test('customer orders: list includes store fields', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const Table = require('../dist/entities/Table').Table
    const Order = require('../dist/entities/Order').Order

    const storeId = `s_${Date.now()}`
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId: 'store_default',
        isPrimary: 1,
        subName: null,
        name: 'MyStore',
        logoUrl: 'https://x/store.png',
        phone: '',
        address: '',
        description: ''
      })
    )

    const tableRepo = ctx.AppDataSource.getRepository(Table)
    const tableId = `tbl_${Date.now()}`
    await tableRepo.save(tableRepo.create({ tableId, storeId, code: 'A01', status: 'FREE' }))

    const customerUserId = `usr_${Date.now()}`
    const token = await getDevToken(ctx.base, 'CUSTOMER', customerUserId)
    const orderRepo = ctx.AppDataSource.getRepository(Order)
    await orderRepo.save(
      orderRepo.create({
        orderId: `ord_${Date.now()}`,
        orderNo: `NO_${Date.now()}`,
        storeId,
        tableId,
        tableSessionVersion: 1,
        userId: customerUserId,
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

    const r = await jsonFetch(`${ctx.base}/api/v1/orders?page=1&pageSize=50`, {
      headers: customerAuthz(token)
    })
    assert.equal(r.resp.status, 200)
    assert.equal(r.json.data.list.length, 1)
    assert.equal(r.json.data.list[0].storeId, storeId)
    assert.equal(r.json.data.list[0].storeName, 'MyStore')
    assert.equal(r.json.data.list[0].storeLogoUrl, 'https://x/store.png')
  })
})
