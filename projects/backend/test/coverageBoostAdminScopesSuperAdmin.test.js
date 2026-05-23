const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('admin scopes: super admin list/grant branches', async () => {
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

      const superAdminId = `admin_sa_${Date.now()}`
      await userRepo.save(
        userRepo.create({
          userId: superAdminId,
          userType: 'ADMIN',
          username: `u_${Date.now()}_sa`,
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
          scopeId: `sc_${Date.now()}_sa`,
          userId: superAdminId,
          tenantId: 'store_default',
          storeId: null,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        })
      )
      const authzSA = await getAuthz(base, 'ADMIN', superAdminId)

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

      const targetAdminId = `admin_x_${Date.now()}`
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
          scopeId: `sc_${Date.now()}_x`,
          userId: targetAdminId,
          tenantId,
          storeId,
          role: 'STORE_ADMIN',
          status: 'ACTIVE'
        })
      )

      const listBad = await jsonFetch(`${base}/api/v1/admin/scopes?userId=`, {
        method: 'GET',
        headers: { ...authzSA, 'x-board': 'platform' }
      })
      assert.equal(listBad.resp.status, 400)

      const listOk = await jsonFetch(`${base}/api/v1/admin/scopes?userId=${encodeURIComponent(targetAdminId)}`, {
        method: 'GET',
        headers: { ...authzSA, 'x-board': 'platform' }
      })
      assert.equal(listOk.resp.status, 200)
      assert.ok(Array.isArray(listOk.json.data.list))

      const grantSuperAdmin = await jsonFetch(`${base}/api/v1/admin/scopes`, {
        method: 'POST',
        headers: { ...authzSA, 'content-type': 'application/json', 'x-board': 'platform' },
        body: JSON.stringify({ userId: targetAdminId, tenantId: 'store_default', role: 'SUPER_ADMIN' })
      })
      assert.equal(grantSuperAdmin.resp.status, 200)
      assert.equal(grantSuperAdmin.json.data.role, 'SUPER_ADMIN')

      const grantTenantAdmin = await jsonFetch(`${base}/api/v1/admin/scopes`, {
        method: 'POST',
        headers: { ...authzSA, 'content-type': 'application/json', 'x-board': 'platform' },
        body: JSON.stringify({ userId: targetAdminId, tenantId, role: 'TENANT_ADMIN' })
      })
      assert.equal(grantTenantAdmin.resp.status, 200)
      assert.equal(grantTenantAdmin.json.data.role, 'TENANT_ADMIN')
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})
