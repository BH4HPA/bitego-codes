const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, tenantAdminAuthz, storeAdminAuthz } = require('./testUtils')

async function ensureSuperAdminScope(AppDataSource) {
  const AdminScope = require('../dist/entities/AdminScope').AdminScope
  const scopeRepo = AppDataSource.getRepository(AdminScope)
  await scopeRepo.save(
    scopeRepo.create({
      scopeId: `sc_${Date.now()}_${Math.random()}`,
      userId: 'admin_1',
      tenantId: 'store_default',
      storeId: null,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE'
    })
  )
}

test('tenant import-from-store rejects non CHAIN tenant', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      await ensureSuperAdminScope(AppDataSource)

      const Tenant = require('../dist/entities/Tenant').Tenant
      const tenantId = `t_single_${Date.now()}`
      const tenantRepo = AppDataSource.getRepository(Tenant)
      await tenantRepo.save(
        tenantRepo.create({
          tenantId,
          type: 'SINGLE',
          brandName: '单店',
          brandLogoUrl: null,
          primaryStoreId: null,
          status: 'ACTIVE'
        })
      )

      const form = new FormData()
      form.append(
        'file',
        new Blob(
          [
            JSON.stringify({
              version: 2,
              exportedAt: new Date().toISOString(),
              store: { storeId: 's', name: 'x' },
              categories: [],
              goods: [],
              skus: [],
              specGroups: [],
              specOptions: [],
              sharedSpecGroups: [],
              sharedSpecOptions: [],
              goodSharedSpecGroups: [],
              tables: []
            })
          ],
          {
            type: 'application/json'
          }
        ),
        'store.json'
      )
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, tenantId),
        body: form
      })
      assert.equal(resp.resp.status, 400)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})

test('tenant import-from-store rejects too large file', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      await ensureSuperAdminScope(AppDataSource)

      const Tenant = require('../dist/entities/Tenant').Tenant
      const Store = require('../dist/entities/Store').Store
      const tenantId = `t_chain_${Date.now()}`
      const tenantRepo = AppDataSource.getRepository(Tenant)
      const storeRepo = AppDataSource.getRepository(Store)
      const storeId = `store_${Date.now()}`
      await tenantRepo.save(
        tenantRepo.create({
          tenantId,
          type: 'CHAIN',
          brandName: '连锁',
          brandLogoUrl: null,
          primaryStoreId: storeId,
          status: 'ACTIVE'
        })
      )
      await storeRepo.save(
        storeRepo.create({
          storeId,
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

      const big = new Uint8Array(51 * 1024 * 1024)
      const form = new FormData()
      form.append('file', new Blob([big], { type: 'application/json' }), 'big.json')
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, tenantId),
        body: form
      })
      assert.equal(resp.resp.status, 413)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})

test('tenant import-from-store rejects missing tenant', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      await ensureSuperAdminScope(AppDataSource)

      const form = new FormData()
      form.append(
        'file',
        new Blob(
          [
            JSON.stringify({
              version: 2,
              exportedAt: new Date().toISOString(),
              store: { storeId: 's', name: 'x' },
              categories: [],
              goods: [],
              skus: [],
              specGroups: [],
              specOptions: [],
              sharedSpecGroups: [],
              sharedSpecOptions: [],
              goodSharedSpecGroups: [],
              tables: []
            })
          ],
          { type: 'application/json' }
        ),
        'store.json'
      )
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, 'tenant_not_exists'),
        body: form
      })
      assert.equal(resp.resp.status, 404)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})

test('tenant import-from-store rejects deleted tenant', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      await ensureSuperAdminScope(AppDataSource)

      const Tenant = require('../dist/entities/Tenant').Tenant
      const tenantId = `t_deleted_${Date.now()}`
      const tenantRepo = AppDataSource.getRepository(Tenant)
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
      await tenantRepo.softDelete({ tenantId })

      const form = new FormData()
      form.append(
        'file',
        new Blob(
          [
            JSON.stringify({
              version: 2,
              exportedAt: new Date().toISOString(),
              store: { storeId: 's', name: 'x' },
              categories: [],
              goods: [],
              skus: [],
              specGroups: [],
              specOptions: [],
              sharedSpecGroups: [],
              sharedSpecOptions: [],
              goodSharedSpecGroups: [],
              tables: []
            })
          ],
          { type: 'application/json' }
        ),
        'store.json'
      )
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, tenantId),
        body: form
      })
      assert.equal(resp.resp.status, 404)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})

test('tenant import-from-store returns invalid upload request on malformed multipart', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      await ensureSuperAdminScope(AppDataSource)

      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, 'tenant_not_exists', { 'content-type': 'multipart/form-data' }),
        body: 'abc'
      })
      assert.equal(resp.resp.status, 400)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})

test('tenant snapshot import returns invalid upload request on malformed multipart', async () => {
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, 'store_default', { 'content-type': 'multipart/form-data' }),
        body: 'abc'
      })
      assert.equal(resp.resp.status, 400)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})

test('tenant import-from-store rejects missing file', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      await ensureSuperAdminScope(AppDataSource)

      const Tenant = require('../dist/entities/Tenant').Tenant
      const Store = require('../dist/entities/Store').Store
      const tenantId = `t_chain_${Date.now()}`
      const tenantRepo = AppDataSource.getRepository(Tenant)
      const storeRepo = AppDataSource.getRepository(Store)
      const storeId = `store_${Date.now()}`
      await tenantRepo.save(
        tenantRepo.create({
          tenantId,
          type: 'CHAIN',
          brandName: '连锁',
          brandLogoUrl: null,
          primaryStoreId: storeId,
          status: 'ACTIVE'
        })
      )
      await storeRepo.save(
        storeRepo.create({
          storeId,
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

      const form = new FormData()
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, tenantId),
        body: form
      })
      assert.equal(resp.resp.status, 400)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})

test('tenant import-from-store rejects invalid json', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      await ensureSuperAdminScope(AppDataSource)

      const Tenant = require('../dist/entities/Tenant').Tenant
      const Store = require('../dist/entities/Store').Store
      const tenantId = `t_chain_${Date.now()}`
      const tenantRepo = AppDataSource.getRepository(Tenant)
      const storeRepo = AppDataSource.getRepository(Store)
      const storeId = `store_${Date.now()}`
      await tenantRepo.save(
        tenantRepo.create({
          tenantId,
          type: 'CHAIN',
          brandName: '连锁',
          brandLogoUrl: null,
          primaryStoreId: storeId,
          status: 'ACTIVE'
        })
      )
      await storeRepo.save(
        storeRepo.create({
          storeId,
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

      const form = new FormData()
      form.append('file', new Blob(['not json'], { type: 'application/json' }), 'store.json')
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, tenantId),
        body: form
      })
      assert.equal(resp.resp.status, 400)
      assert.equal(resp.json.success, false)
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})
