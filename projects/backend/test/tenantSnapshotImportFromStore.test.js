const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, tenantAdminAuthz } = require('./testUtils')

test('tenant import-from-store rebuilds primary store and removes sub stores', async () => {
  await withServer(
    async ({ base, AppDataSource }) => {
      const { config } = require('../dist/config')
      const token = await getDevToken(base, 'ADMIN')
      const AdminScope = require('../dist/entities/AdminScope').AdminScope
      const Tenant = require('../dist/entities/Tenant').Tenant
      const Store = require('../dist/entities/Store').Store
      const Category = require('../dist/entities/Category').Category

      const scopeRepo = AppDataSource.getRepository(AdminScope)
      await scopeRepo.save(
        scopeRepo.create({
          scopeId: `sc_${Date.now()}`,
          userId: 'admin_1',
          tenantId: 'store_default',
          storeId: null,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        })
      )

      const tenantId = `t_${Date.now()}`
      const tenantRepo = AppDataSource.getRepository(Tenant)
      await tenantRepo.save(
        tenantRepo.create({
          tenantId,
          type: 'CHAIN',
          brandName: '连锁A',
          brandLogoUrl: null,
          primaryStoreId: null,
          status: 'ACTIVE'
        })
      )

      const storeRepo = AppDataSource.getRepository(Store)
      const oldPrimaryId = `store_p_${Date.now()}`
      const oldSubId = `store_s_${Date.now()}`
      await storeRepo.save(
        storeRepo.create({
          storeId: oldPrimaryId,
          tenantId,
          isPrimary: 1,
          subName: null,
          name: '旧主店',
          logoUrl: '',
          phone: '',
          address: '',
          description: ''
        })
      )
      await storeRepo.save(
        storeRepo.create({
          storeId: oldSubId,
          tenantId,
          isPrimary: 0,
          subName: '二店',
          name: '旧二店',
          logoUrl: '',
          phone: '',
          address: '',
          description: ''
        })
      )
      await tenantRepo.update({ tenantId }, { primaryStoreId: oldPrimaryId })

      const catRepo = AppDataSource.getRepository(Category)
      await catRepo.save(
        catRepo.create({
          categoryId: `cat_old_${Date.now()}`,
          storeId: oldSubId,
          name: '旧分类',
          subtitle: '',
          badgeText: '',
          sort: 0,
          status: 'ACTIVE'
        })
      )

      config.wechatMiniProgram.appId = 'wx_test'
      config.wechatMiniProgram.secret = 'wx_test_secret'
      config.wechatMiniProgram.qrcodePagePath = 'pages/table/index'
      globalThis.__COS_PUT_OBJECT__ = async () => ({ ETag: 'ETag', Location: 'mock' })
      globalThis.__WX_FETCH__ = async (url, init) => {
        const u = String(url)
        if (u.includes('/cgi-bin/stable_token')) {
          return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200, errcode: 0 }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        }
        if (u.includes('/wxa/getwxacodeunlimit')) {
          void init
          return new Response(Buffer.from('png'), { status: 200, headers: { 'content-type': 'image/png' } })
        }
        return new Response('not found', { status: 404 })
      }

      const independentExport = {
        version: 2,
        exportedAt: new Date().toISOString(),
        store: {
          storeId: 'store_default',
          name: '独立店导入主店',
          logoUrl: '',
          phone: '',
          address: '',
          description: ''
        },
        categories: [
          {
            categoryId: 'cat_src_1',
            storeId: 'store_default',
            name: '饮品',
            subtitle: null,
            badgeText: null,
            sort: 10,
            status: 'ACTIVE'
          }
        ],
        goods: [],
        skus: [],
        specGroups: [],
        specOptions: [],
        sharedSpecGroups: [],
        sharedSpecOptions: [],
        goodSharedSpecGroups: [],
        tables: [{ tableId: 'tbl_src_1', storeId: 'store_default', code: 'A01', status: 'FREE', qrcodeUrl: null }]
      }

      const form = new FormData()
      form.append('file', new Blob([JSON.stringify(independentExport)], { type: 'application/json' }), 'store.json')
      const resp = await jsonFetch(`${base}/api/v1/tenant/snapshot/import-from-store`, {
        method: 'POST',
        headers: tenantAdminAuthz(token, tenantId),
        body: form
      })
      assert.equal(resp.resp.status, 200)
      assert.equal(resp.json.success, true)
      const newPrimaryStoreId = resp.json.data.newPrimaryStoreId
      assert.ok(newPrimaryStoreId)

      const tenantAfter = await tenantRepo.findOne({ where: { tenantId } })
      assert.equal(tenantAfter.primaryStoreId, newPrimaryStoreId)

      const activeStores = await storeRepo.find({ where: { tenantId } })
      assert.equal(activeStores.length, 1)
      assert.equal(activeStores[0].storeId, newPrimaryStoreId)
      assert.equal(Number(activeStores[0].isPrimary || 0), 1)

      const oldStoresWithDeleted = await storeRepo.find({ where: { storeId: oldPrimaryId }, withDeleted: true })
      assert.ok(oldStoresWithDeleted.length === 1)
      assert.ok(oldStoresWithDeleted[0].deletedAt)

      const newCats = await catRepo.find({ where: { storeId: newPrimaryStoreId } })
      assert.equal(newCats.length, 1)
      assert.equal(newCats[0].name, '饮品')

      globalThis.__WX_FETCH__ = undefined
      globalThis.__COS_PUT_OBJECT__ = undefined
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})
