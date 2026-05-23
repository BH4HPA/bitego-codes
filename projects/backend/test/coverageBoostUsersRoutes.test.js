const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('tenant/store users routes: list admins and customers and create store admin', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { User } = require('../dist/entities/User')
    const { AdminScope } = require('../dist/entities/AdminScope')
    const { Order } = require('../dist/entities/Order')
    const { hashPassword } = require('../dist/utils/password')

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)
    const userRepo = AppDataSource.getRepository(User)
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const orderRepo = AppDataSource.getRepository(Order)

    const tenantId = `t_${Date.now()}`
    const storeId = `store_${Date.now()}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'T',
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
    const storeAdminId = `admin_s_${Date.now()}`
    await userRepo.save(
      userRepo.create({
        userId: tenantAdminId,
        userType: 'ADMIN',
        username: `u_${Date.now()}`,
        passwordHash: hashPassword('p_123456'),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'TA',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    await userRepo.save(
      userRepo.create({
        userId: storeAdminId,
        userType: 'ADMIN',
        username: `u_${Date.now()}_2`,
        passwordHash: hashPassword('p_123456'),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'SA',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_1`,
        userId: tenantAdminId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_2`,
        userId: storeAdminId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const customerId = `usr_${Date.now()}`
    await userRepo.save(
      userRepo.create({
        userId: customerId,
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: `wx_${Date.now()}`,
        wechatUnionid: null,
        nickname: 'C',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    await orderRepo.save(
      orderRepo.create({
        orderId: `ord_${Date.now()}`,
        orderNo: `no_${Date.now()}`,
        storeId,
        tableId: null,
        tableSessionVersion: null,
        userId: customerId,
        status: 'PAID',
        paymentMethod: 'wechat',
        remark: '',
        totalAmount: '100',
        paidAmount: '100',
        refundedAmount: null,
        paidAt: null,
        completedAt: null,
        canceledAt: null,
        refundedAt: null
      })
    )

    const authzTenant = await getAuthz(base, 'ADMIN', tenantAdminId)

    const listAdmins = await jsonFetch(`${base}/api/v1/tenant/users?userType=ADMIN&page=1&pageSize=20`, {
      method: 'GET',
      headers: { ...authzTenant, 'x-tenant-id': tenantId, 'x-board': 'tenant' }
    })
    assert.equal(listAdmins.resp.status, 200)
    assert.ok(listAdmins.json && listAdmins.json.success)
    assert.equal(Array.isArray(listAdmins.json.data.list), true)

    const listCustomers = await jsonFetch(`${base}/api/v1/tenant/users?userType=CUSTOMER&page=1&pageSize=20`, {
      method: 'GET',
      headers: { ...authzTenant, 'x-tenant-id': tenantId, 'x-board': 'tenant' }
    })
    assert.equal(listCustomers.resp.status, 200)
    assert.equal(Array.isArray(listCustomers.json.data.list), true)

    const created = await jsonFetch(`${base}/api/v1/tenant/admin-users`, {
      method: 'POST',
      headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
      body: JSON.stringify({ username: `new_${Date.now()}`, password: '123456', storeId })
    })
    assert.equal(created.resp.status, 200)
    assert.ok(created.json && created.json.data && created.json.data.userId)

    const authzStore = await getAuthz(base, 'ADMIN', storeAdminId)
    const storeAdmins = await jsonFetch(`${base}/api/v1/store/users?userType=ADMIN&page=1&pageSize=20`, {
      method: 'GET',
      headers: { ...authzStore, 'x-tenant-id': tenantId, 'x-store-id': storeId, 'x-board': 'store' }
    })
    assert.equal(storeAdmins.resp.status, 200)

    const storeCustomers = await jsonFetch(`${base}/api/v1/store/users?userType=CUSTOMER&page=1&pageSize=20`, {
      method: 'GET',
      headers: { ...authzStore, 'x-tenant-id': tenantId, 'x-store-id': storeId, 'x-board': 'store' }
    })
    assert.equal(storeCustomers.resp.status, 200)

    const created2 = await jsonFetch(`${base}/api/v1/store/admin-users`, {
      method: 'POST',
      headers: {
        ...authzStore,
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        'x-store-id': storeId,
        'x-board': 'store'
      },
      body: JSON.stringify({ username: `new2_${Date.now()}`, password: '123456' })
    })
    assert.equal(created2.resp.status, 200)
  })
})

test('overview stores includes tenant/store logos and onlineUserCount', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { AdminScope } = require('../dist/entities/AdminScope')

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)
    const scopeRepo = AppDataSource.getRepository(AdminScope)

    const tenantId = `t_${Date.now()}`
    const storeId = `store_${Date.now()}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: 'https://example.com/t.png',
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
        name: 'Store',
        logoUrl: 'https://example.com/s.png',
        phone: '',
        address: '',
        description: ''
      })
    )

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

    const r = await jsonFetch(`${base}/api/v1/platform/overview/stores?page=1&pageSize=20`, {
      method: 'GET',
      headers: { ...authz, 'x-board': 'platform' }
    })
    assert.equal(r.resp.status, 200)
    const first = r.json.data.list.find((x) => x.storeId === storeId)
    assert.ok(first)
    assert.equal(first.tenantBrandName, 'Brand')
    assert.equal(first.tenantBrandLogoUrl, 'https://example.com/t.png')
    assert.equal(first.logoUrl, 'https://example.com/s.png')
    assert.equal(typeof first.onlineUserCount, 'number')
  })
})
