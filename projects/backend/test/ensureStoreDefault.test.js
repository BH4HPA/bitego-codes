const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer } = require('./testUtils')

test('ensureStoreDefaultTenantAndStore does not downgrade chain tenants', async () => {
  await withServer(
    async ({ AppDataSource }) => {
      const Tenant = require('../dist/entities/Tenant').Tenant
      const Store = require('../dist/entities/Store').Store
      const { ensureStoreDefaultTenantAndStore } = require('../dist/bootstrap/ensureStoreDefault')

      const tenantRepo = AppDataSource.getRepository(Tenant)
      const storeRepo = AppDataSource.getRepository(Store)

      const tenantId = `t_chain_${Date.now()}`
      await tenantRepo.save(
        tenantRepo.create({
          tenantId,
          type: 'CHAIN',
          brandName: '连锁',
          brandLogoUrl: null,
          primaryStoreId: null,
          status: 'ACTIVE'
        })
      )
      await storeRepo.save(
        storeRepo.create({
          storeId: `s1_${Date.now()}`,
          tenantId,
          isPrimary: 1,
          subName: null,
          name: '主店',
          logoUrl: '',
          phone: '',
          address: '',
          description: ''
        })
      )

      await ensureStoreDefaultTenantAndStore(AppDataSource)

      const tenantAfter = await tenantRepo.findOne({ where: { tenantId } })
      assert.equal(tenantAfter.type, 'CHAIN')
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})
