const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz, tenantAdminAuthz } = require('./testUtils')

test('tenant snapshot export/upload and import/reset work', async () => {
  let originalPut = null
  let captured = null
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      const Store = require('../dist/entities/Store').Store
      const Category = require('../dist/entities/Category').Category
      const Good = require('../dist/entities/Good').Good
      const Table = require('../dist/entities/Table').Table

      const storeRepo = AppDataSource.getRepository(Store)
      const catRepo = AppDataSource.getRepository(Category)
      const goodRepo = AppDataSource.getRepository(Good)
      const tableRepo = AppDataSource.getRepository(Table)

      const extraStoreId = `s_${Date.now()}`
      await storeRepo.save(
        storeRepo.create({
          storeId: extraStoreId,
          tenantId: 'store_default',
          isPrimary: 0,
          subName: null,
          name: '二店',
          logoUrl: '',
          phone: '',
          address: '',
          description: ''
        })
      )
      await catRepo.save(
        catRepo.create({
          categoryId: `cat_${Date.now()}`,
          storeId: extraStoreId,
          name: '饮品',
          subtitle: '',
          badgeText: '',
          sort: 0,
          status: 'ACTIVE'
        })
      )
      await goodRepo.save(
        goodRepo.create({
          goodId: `good_${Date.now()}`,
          storeId: extraStoreId,
          categoryId: (await catRepo.findOne({ where: { storeId: extraStoreId } })).categoryId,
          defaultSkuId: null,
          name: '可乐',
          description: '',
          detailMarkdown: null,
          imageUrl: '',
          imageUrls: null,
          sales: 0,
          basePrice: '1000',
          status: 'ON_SHELF'
        })
      )
      await tableRepo.save(
        tableRepo.create({
          tableId: `tbl_${Date.now()}`,
          storeId: extraStoreId,
          code: 'A01',
          status: 'FREE',
          sessionVersion: 1,
          sessionClosedAt: null,
          qrcodeUrl: null
        })
      )

      const exportResp = await jsonFetch(`${base}/api/v1/tenant/snapshot/export?includeInactive=1`, {
        headers: tenantAdminAuthz(token, 'store_default')
      })
      assert.equal(exportResp.resp.status, 200)
      assert.ok(captured && Buffer.isBuffer(captured.body))
      const snap = JSON.parse(captured.body.toString('utf8'))
      assert.equal(snap.version, 1)
      assert.equal(snap.tenantId, 'store_default')
      assert.ok(Array.isArray(snap.stores))
      assert.ok(snap.stores.length >= 1)

      const form = new FormData()
      form.append('file', new Blob([captured.body], { type: 'application/json' }), 'tenant.json')
      const importResp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import`, {
        method: 'POST',
        headers: tenantAdminAuthz(token),
        body: form
      })
      assert.equal(importResp.resp.status, 200)

      const resetResp = await jsonFetch(`${base}/api/v1/tenant/snapshot/reset`, {
        method: 'POST',
        headers: tenantAdminAuthz(token)
      })
      assert.equal(resetResp.resp.status, 200)
    },
    () => {
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async (params) => {
        captured = params
        return { ETag: '"etag"', Location: `cos://${params.key}` }
      }
    },
    () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    },
    { withDb: true, withRedis: true }
  )
})

test('store maintenance blocks write but allows read', async () => {
  const { setStoreMaintenanceState } = require('../dist/services/maintenance')
  await withServer(async ({ base }) => {
    const token = await getDevToken(base, 'ADMIN')
    await setStoreMaintenanceState('store_default', true, '门店恢复中')
    try {
      const r1 = await jsonFetch(`${base}/api/v1/categories?page=1&pageSize=1`, {
        headers: storeAdminAuthz(token)
      })
      assert.equal(r1.resp.status, 200)
      const r2 = await jsonFetch(`${base}/api/v1/categories`, {
        method: 'POST',
        headers: storeAdminAuthz(token),
        body: JSON.stringify({ name: 'C', subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
      })
      assert.equal(r2.resp.status, 503)
    } finally {
      await setStoreMaintenanceState('store_default', false)
    }
  })
})

test('admin maintenance endpoint returns scoped states', async () => {
  const { setStoreMaintenanceState } = require('../dist/services/maintenance')
  await withServer(async ({ base }) => {
    const token = await getDevToken(base, 'ADMIN')
    await setStoreMaintenanceState('store_default', true, '门店恢复中')
    try {
      const r = await jsonFetch(`${base}/api/v1/admin/maintenance`, {
        headers: storeAdminAuthz(token)
      })
      assert.equal(r.resp.status, 200)
      assert.equal(r.json.success, true)
      assert.equal(r.json.data.store.enabled, true)
    } finally {
      await setStoreMaintenanceState('store_default', false)
    }
  })
})
