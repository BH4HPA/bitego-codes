const test = require('node:test')
const assert = require('node:assert/strict')
const {
  withServer,
  getDevToken,
  jsonFetch,
  storeAdminAuthz,
  customerAuthz,
  tenantAdminAuthz,
  platformAdminAuthz
} = require('./testUtils')

test('coverage: orders export/status logs and tenant branding branches', async () => {
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

    const badList = await jsonFetch(`${ctx.base}/api/v1/orders?createdAtFrom=bad`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(badList.resp.status, 400)

    const badExport = await jsonFetch(`${ctx.base}/api/v1/orders/export?createdAtTo=bad`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(badExport.resp.status, 400)

    const badFormat = await jsonFetch(`${ctx.base}/api/v1/orders/export?format=xlsx`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(badFormat.resp.status, 400)

    const okXls = await jsonFetch(`${ctx.base}/api/v1/orders/export?format=xls`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeId)
    })
    assert.equal(okXls.resp.status, 200)
    assert.ok(okXls.text.includes('\t'))

    const customerA = `c_${Date.now()}_a`
    const customerB = `c_${Date.now()}_b`
    const tokenA = await getDevToken(ctx.base, 'CUSTOMER', customerA)
    const tokenB = await getDevToken(ctx.base, 'CUSTOMER', customerB)
    const orderRepo = ctx.AppDataSource.getRepository(Order)
    const orderId = `ord_${Date.now()}`
    await orderRepo.save(
      orderRepo.create({
        orderId,
        orderNo: `NO_${Date.now()}`,
        storeId,
        tableId: null,
        tableSessionVersion: null,
        userId: customerA,
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
    const forbidLogs = await jsonFetch(`${ctx.base}/api/v1/orders/${encodeURIComponent(orderId)}/status-logs`, {
      headers: customerAuthz(tokenB)
    })
    assert.equal(forbidLogs.resp.status, 403)

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

    const branding0 = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(tenantAdminToken, tenantId, {
        'content-type': 'application/json',
        'x-store-id': storeId
      }),
      body: JSON.stringify({})
    })
    assert.equal(branding0.resp.status, 400)

    const branding1 = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(tenantAdminToken, tenantId, {
        'content-type': 'application/json',
        'x-store-id': storeId
      }),
      body: JSON.stringify({ brandName: '' })
    })
    assert.equal(branding1.resp.status, 400)

    const branding2 = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(tenantAdminToken, tenantId, {
        'content-type': 'application/json',
        'x-store-id': storeId
      }),
      body: JSON.stringify({ brandLogoUrl: 'x'.repeat(501) })
    })
    assert.equal(branding2.resp.status, 400)

    const missTenantId = `t_missing_${Date.now()}`
    const missUserId = `adm_${Date.now()}_miss`
    const missToken = await getDevToken(ctx.base, 'ADMIN', missUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: missUserId,
        tenantId: missTenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    const missTenant = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      headers: tenantAdminAuthz(missToken, missTenantId)
    })
    assert.equal(missTenant.resp.status, 404)
  })
})
test('platform tenants: create rejects existing tenant/store', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const superUserId = `super_${Date.now()}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: superUserId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )

    const tenantId = `t_${Date.now()}`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId: null,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )
    const dupTenant = await jsonFetch(`${ctx.base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, type: 'CHAIN', brandName: 'B' })
    })
    assert.equal(dupTenant.resp.status, 400)

    const storeId = `store_${Date.now()}`
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId: 'store_default',
        isPrimary: 0,
        subName: null,
        name: 'S',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    const dupStore = await jsonFetch(`${ctx.base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CHAIN', brandName: 'B2', storeId })
    })
    assert.equal(dupStore.resp.status, 400)
  })
})
