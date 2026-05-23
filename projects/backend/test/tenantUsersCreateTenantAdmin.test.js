const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('tenant admin can create TENANT_ADMIN user and grant TENANT_ADMIN scope', async () => {
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

      const createResp = await jsonFetch(`${base}/api/v1/tenant/admin-users`, {
        method: 'POST',
        headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
        body: JSON.stringify({ username: `u_new_${Date.now()}`, password: '123456', role: 'TENANT_ADMIN' })
      })
      assert.equal(createResp.resp.status, 200)
      const createdScopeId = createResp.json.data.scopeId
      const createdScope = await scopeRepo.findOne({ where: { scopeId: createdScopeId } })
      assert.equal(createdScope.role, 'TENANT_ADMIN')
      assert.equal(createdScope.storeId, null)
      assert.equal(createdScope.tenantId, tenantId)

      const otherAdminId = `admin_o_${Date.now()}`
      await userRepo.save(
        userRepo.create({
          userId: otherAdminId,
          userType: 'ADMIN',
          username: `u_${Date.now()}_o`,
          passwordHash: hashPassword('p_123456'),
          wechatOpenid: null,
          wechatUnionid: null,
          nickname: 'OA',
          avatarUrl: '',
          phoneNumber: null,
          status: 'ACTIVE',
          lastLoginAt: null
        })
      )
      const grantResp = await jsonFetch(`${base}/api/v1/admin/scopes`, {
        method: 'POST',
        headers: { ...authzTenant, 'content-type': 'application/json', 'x-tenant-id': tenantId, 'x-board': 'tenant' },
        body: JSON.stringify({ userId: otherAdminId, tenantId, role: 'TENANT_ADMIN' })
      })
      assert.equal(grantResp.resp.status, 200)
      assert.equal(grantResp.json.data.role, 'TENANT_ADMIN')
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})
