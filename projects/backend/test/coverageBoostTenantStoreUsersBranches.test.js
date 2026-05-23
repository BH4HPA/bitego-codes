const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('tenant/store users routes cover guards and error branches', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { User } = require('../dist/entities/User')
    const { AdminScope } = require('../dist/entities/AdminScope')
    const { hashPassword } = require('../dist/utils/password')

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)
    const userRepo = AppDataSource.getRepository(User)
    const scopeRepo = AppDataSource.getRepository(AdminScope)

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
        scopeId: `sc_${Date.now()}_t`,
        userId: tenantAdminId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
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

    const authzTenant = await getAuthz(base, 'ADMIN', tenantAdminId)
    const authzStore = await getAuthz(base, 'ADMIN', storeAdminId)

    const invalidUserType = await jsonFetch(`${base}/api/v1/tenant/users?userType=BAD`, {
      method: 'GET',
      headers: { ...authzTenant, 'x-tenant-id': tenantId, 'x-board': 'tenant' }
    })
    assert.equal(invalidUserType.resp.status, 400)

    const forbiddenTenantUsers = await jsonFetch(`${base}/api/v1/tenant/users?userType=ADMIN`, {
      method: 'GET',
      headers: { ...authzStore, 'x-tenant-id': tenantId, 'x-store-id': storeId, 'x-board': 'store' }
    })
    assert.equal(forbiddenTenantUsers.resp.status, 403)

    const customerEmpty = await jsonFetch(`${base}/api/v1/tenant/users?userType=CUSTOMER&page=1&pageSize=10`, {
      method: 'GET',
      headers: { ...authzTenant, 'x-tenant-id': tenantId, 'x-board': 'tenant' }
    })
    assert.equal(customerEmpty.resp.status, 200)
    assert.equal(customerEmpty.json.data.list.length, 0)

    const createBad0 = await jsonFetch(`${base}/api/v1/tenant/admin-users`, {
      method: 'POST',
      headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
      body: JSON.stringify({ username: 'x', password: '1' })
    })
    assert.equal(createBad0.resp.status, 400)

    const createBad1 = await jsonFetch(`${base}/api/v1/tenant/admin-users`, {
      method: 'POST',
      headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
      body: JSON.stringify({ username: 'x', password: '123456', storeId: 'missing' })
    })
    assert.equal(createBad1.resp.status, 404)

    const createBad2 = await jsonFetch(`${base}/api/v1/tenant/admin-users`, {
      method: 'POST',
      headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
      body: JSON.stringify({ username: `u_${Date.now()}`, password: '123456', storeId, nickname: 'x'.repeat(50) })
    })
    assert.equal(createBad2.resp.status, 400)

    const storeMissingCtx = await jsonFetch(`${base}/api/v1/store/users?userType=ADMIN`, {
      method: 'GET',
      headers: { ...authzTenant, 'x-board': 'platform' }
    })
    assert.equal(storeMissingCtx.resp.status, 400)

    const storeInvalidUserType = await jsonFetch(`${base}/api/v1/store/users?userType=BAD`, {
      method: 'GET',
      headers: { ...authzStore, 'x-tenant-id': tenantId, 'x-store-id': storeId, 'x-board': 'store' }
    })
    assert.equal(storeInvalidUserType.resp.status, 400)

    const storeAdminsWithKeyword = await jsonFetch(
      `${base}/api/v1/store/users?userType=ADMIN&keyword=${encodeURIComponent('SA')}`,
      {
        method: 'GET',
        headers: { ...authzStore, 'x-tenant-id': tenantId, 'x-store-id': storeId, 'x-board': 'store' }
      }
    )
    assert.equal(storeAdminsWithKeyword.resp.status, 200)

    const createStoreBad0 = await jsonFetch(`${base}/api/v1/store/admin-users`, {
      method: 'POST',
      headers: {
        ...authzStore,
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        'x-store-id': storeId,
        'x-board': 'store'
      },
      body: JSON.stringify({ username: 'x', password: '1' })
    })
    assert.equal(createStoreBad0.resp.status, 400)
  })
})
