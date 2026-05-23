const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('admin scopes: tenant admin granting covers validation branches', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
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
          type: 'SINGLE',
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
      const targetAdminId = `admin_x_${Date.now()}`
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
          userId: targetAdminId,
          userType: 'ADMIN',
          username: `u_${Date.now()}_x`,
          passwordHash: hashPassword('p_123456'),
          wechatOpenid: null,
          wechatUnionid: null,
          nickname: 'XA',
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
      const authzTenant = await getAuthz(base, 'ADMIN', tenantAdminId)

      const badMissingUserId = await jsonFetch(`${base}/api/v1/admin/scopes`, {
        method: 'POST',
        headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
        body: JSON.stringify({ tenantId, role: 'TENANT_ADMIN' })
      })
      assert.equal(badMissingUserId.resp.status, 400)

      const badStoreIdForTenantAdmin = await jsonFetch(`${base}/api/v1/admin/scopes`, {
        method: 'POST',
        headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
        body: JSON.stringify({ userId: targetAdminId, tenantId, role: 'TENANT_ADMIN', storeId })
      })
      assert.equal(badStoreIdForTenantAdmin.resp.status, 400)

      const badMissingStoreIdForStoreAdmin = await jsonFetch(`${base}/api/v1/admin/scopes`, {
        method: 'POST',
        headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
        body: JSON.stringify({ userId: targetAdminId, tenantId, role: 'STORE_ADMIN' })
      })
      assert.equal(badMissingStoreIdForStoreAdmin.resp.status, 400)

      const forbiddenSuperAdmin = await jsonFetch(`${base}/api/v1/admin/scopes`, {
        method: 'POST',
        headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
        body: JSON.stringify({ userId: targetAdminId, tenantId, role: 'SUPER_ADMIN' })
      })
      assert.equal(forbiddenSuperAdmin.resp.status, 403)

      const getBadUserId = await jsonFetch(`${base}/api/v1/admin/scopes?userId=`, {
        method: 'GET',
        headers: { ...authzTenant, 'x-tenant-id': tenantId, 'x-board': 'tenant' }
      })
      assert.equal(getBadUserId.resp.status, 400)

      const getOk = await jsonFetch(`${base}/api/v1/admin/scopes?userId=${encodeURIComponent(targetAdminId)}`, {
        method: 'GET',
        headers: { ...authzTenant, 'x-tenant-id': tenantId, 'x-board': 'tenant' }
      })
      assert.equal(getOk.resp.status, 200)
      assert.ok(Array.isArray(getOk.json.data.list))
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})
