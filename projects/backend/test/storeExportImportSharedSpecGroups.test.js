const test = require('node:test')
const assert = require('node:assert/strict')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'bitego-secret'
process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'

const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('store export includes shared spec groups and links', async () => {
  let captured = null
  let originalPut
  await withServer(
    async ({ base, AppDataSource }) => {
      const suffix = String(Date.now())
      const token = await getDevToken(base, 'ADMIN')

      const repoStore = AppDataSource.getRepository(require('../dist/entities/Store').Store)
      const repoCat = AppDataSource.getRepository(require('../dist/entities/Category').Category)
      const repoGood = AppDataSource.getRepository(require('../dist/entities/Good').Good)
      const repoGoodCat = AppDataSource.getRepository(require('../dist/entities/GoodCategory').GoodCategory)
      const repoSsg = AppDataSource.getRepository(require('../dist/entities/SharedSpecGroup').SharedSpecGroup)
      const repoSso = AppDataSource.getRepository(require('../dist/entities/SharedSpecOption').SharedSpecOption)
      const repoLink = AppDataSource.getRepository(require('../dist/entities/GoodSharedSpecGroup').GoodSharedSpecGroup)
      const repoSg = AppDataSource.getRepository(require('../dist/entities/SpecGroup').SpecGroup)
      const repoSo = AppDataSource.getRepository(require('../dist/entities/SpecOption').SpecOption)

      const store = await repoStore.findOne({ where: { storeId: 'store_default' } })
      if (!store) {
        await repoStore.save(
          repoStore.create({
            storeId: 'store_default',
            name: `测试门店_${suffix}`,
            logoUrl: '',
            phone: '',
            address: '',
            description: ''
          })
        )
      }
      await repoCat.save(
        repoCat.create({
          categoryId: `cat_${suffix}`,
          storeId: 'store_default',
          name: '饮品',
          sort: 10,
          status: 'ACTIVE'
        })
      )
      const inactiveCategoryId = `cat_inactive_${suffix}`
      await repoCat.save(
        repoCat.create({
          categoryId: inactiveCategoryId,
          storeId: 'store_default',
          name: '停用分类',
          sort: 0,
          status: 'INACTIVE'
        })
      )
      await repoGood.save(
        repoGood.create({
          goodId: `good_${suffix}`,
          storeId: 'store_default',
          categoryId: inactiveCategoryId,
          name: '奶茶',
          description: '',
          detailMarkdown: null,
          imageUrl: '',
          imageUrls: null,
          sales: 0,
          basePrice: '1000',
          status: 'ON_SHELF'
        })
      )
      await repoGoodCat.save(
        repoGoodCat.create({
          storeId: 'store_default',
          goodId: `good_${suffix}`,
          categoryId: inactiveCategoryId,
          sort: 0
        })
      )

      const inactiveSpecGroupId = `sg_inactive_${suffix}`
      const inactiveOptionId = `opt_inactive_${suffix}`
      await repoSg.save(
        repoSg.create({
          specGroupId: inactiveSpecGroupId,
          goodId: `good_${suffix}`,
          name: '停用规格组',
          isRequired: 1,
          minSelection: 1,
          maxSelection: 1,
          sort: 0,
          status: 'INACTIVE'
        })
      )
      await repoSo.save(
        repoSo.create({
          optionId: inactiveOptionId,
          specGroupId: inactiveSpecGroupId,
          name: '停用规格值',
          priceCents: '0',
          sort: 0,
          status: 'INACTIVE'
        })
      )

      const sharedSpecGroupId = `ssg_${suffix}`
      const optionId = `sso_${suffix}`
      await repoSsg.save(
        repoSsg.create({
          sharedSpecGroupId,
          storeId: 'store_default',
          name: '加料',
          description: '提示',
          isRequired: 1,
          minSelection: 1,
          maxSelection: 1,
          sort: 0,
          defaultOptionIds: JSON.stringify([optionId]),
          status: 'ACTIVE'
        })
      )
      await repoSso.save(
        repoSso.create({
          optionId,
          sharedSpecGroupId,
          name: '珍珠',
          priceCents: '100',
          sort: 0,
          status: 'ACTIVE'
        })
      )
      const inactiveSharedSpecGroupId = `ssg_inactive_${suffix}`
      const inactiveSharedOptionId = `sso_inactive_${suffix}`
      await repoSsg.save(
        repoSsg.create({
          sharedSpecGroupId: inactiveSharedSpecGroupId,
          storeId: 'store_default',
          name: '停用共享组',
          isRequired: 0,
          minSelection: 0,
          maxSelection: 1,
          sort: 0,
          defaultOptionIds: null,
          status: 'INACTIVE'
        })
      )
      await repoSso.save(
        repoSso.create({
          optionId: inactiveSharedOptionId,
          sharedSpecGroupId: inactiveSharedSpecGroupId,
          name: '停用共享值',
          priceCents: '0',
          sort: 0,
          status: 'INACTIVE'
        })
      )
      await repoLink.save(
        repoLink.create({
          storeId: 'store_default',
          goodId: `good_${suffix}`,
          sharedSpecGroupId,
          disabledOptionIds: JSON.stringify([]),
          defaultOptionIds: JSON.stringify([optionId]),
          sort: 10
        })
      )

      const { resp, json } = await jsonFetch(`${base}/api/v1/stores/export`, { headers: storeAdminAuthz(token) })
      assert.equal(resp.status, 200)
      assert.equal(json.success, true)
      assert.ok(captured && captured.body)
      const exported = JSON.parse(String(captured.body))
      assert.equal(exported.version, 2)
      assert.ok(Array.isArray(exported.sharedSpecGroups))
      assert.ok(Array.isArray(exported.sharedSpecOptions))
      assert.ok(Array.isArray(exported.goodSharedSpecGroups))
      assert.ok(
        exported.sharedSpecGroups.some(
          (g) =>
            g.sharedSpecGroupId === sharedSpecGroupId &&
            g.description === '提示' &&
            Array.isArray(g.defaultOptionIds) &&
            g.defaultOptionIds[0] === optionId
        )
      )
      assert.ok(
        exported.sharedSpecOptions.some((o) => o.optionId === optionId && o.sharedSpecGroupId === sharedSpecGroupId)
      )
      assert.ok(
        exported.goodSharedSpecGroups.some(
          (l) =>
            l.goodId === `good_${suffix}` &&
            l.sharedSpecGroupId === sharedSpecGroupId &&
            Array.isArray(l.defaultOptionIds) &&
            l.defaultOptionIds[0] === optionId
        )
      )
      assert.ok(!exported.specGroups.some((g) => g.specGroupId === inactiveSpecGroupId))
      assert.ok(!exported.specOptions.some((o) => o.optionId === inactiveOptionId))
      assert.ok(!exported.sharedSpecGroups.some((g) => g.sharedSpecGroupId === inactiveSharedSpecGroupId))
      assert.ok(!exported.sharedSpecOptions.some((o) => o.optionId === inactiveSharedOptionId))
      assert.ok(!exported.categories.some((c) => c.categoryId === inactiveCategoryId))
      const eg = exported.goods.find((x) => x.goodId === `good_${suffix}`)
      assert.ok(eg)
      assert.equal(eg.categoryId, `cat_${suffix}`)
      assert.ok(Array.isArray(eg.categoryIds))
      assert.ok(eg.categoryIds.includes(`cat_${suffix}`))
      assert.ok(!eg.categoryIds.includes(inactiveCategoryId))
    },
    async () => {
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async (params) => {
        captured = params
        return { ETag: '"etag"', Location: `cos://${params.key}` }
      }
    },
    async () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    }
  )
})

test('store export includes inactive config when includeInactive=1', async () => {
  let captured = null
  let originalPut
  await withServer(
    async ({ base, AppDataSource }) => {
      const suffix = String(Date.now())
      const token = await getDevToken(base, 'ADMIN')

      const repoStore = AppDataSource.getRepository(require('../dist/entities/Store').Store)
      const repoCat = AppDataSource.getRepository(require('../dist/entities/Category').Category)
      const repoGood = AppDataSource.getRepository(require('../dist/entities/Good').Good)
      const repoSsg = AppDataSource.getRepository(require('../dist/entities/SharedSpecGroup').SharedSpecGroup)
      const repoSso = AppDataSource.getRepository(require('../dist/entities/SharedSpecOption').SharedSpecOption)
      const repoLink = AppDataSource.getRepository(require('../dist/entities/GoodSharedSpecGroup').GoodSharedSpecGroup)
      const repoSg = AppDataSource.getRepository(require('../dist/entities/SpecGroup').SpecGroup)
      const repoSo = AppDataSource.getRepository(require('../dist/entities/SpecOption').SpecOption)

      const store = await repoStore.findOne({ where: { storeId: 'store_default' } })
      if (!store) {
        await repoStore.save(
          repoStore.create({
            storeId: 'store_default',
            name: `测试门店_${suffix}`,
            logoUrl: '',
            phone: '',
            address: '',
            description: ''
          })
        )
      }
      const catId = `cat_${suffix}`
      const inactiveCategoryId = `cat_inactive_${suffix}`
      await repoCat.save(
        repoCat.create({ categoryId: catId, storeId: 'store_default', name: '饮品', sort: 10, status: 'ACTIVE' })
      )
      await repoCat.save(
        repoCat.create({
          categoryId: inactiveCategoryId,
          storeId: 'store_default',
          name: '停用分类',
          sort: 0,
          status: 'INACTIVE'
        })
      )
      await repoGood.save(
        repoGood.create({
          goodId: `good_${suffix}`,
          storeId: 'store_default',
          categoryId: catId,
          name: '奶茶',
          description: '',
          detailMarkdown: null,
          imageUrl: '',
          imageUrls: null,
          sales: 0,
          basePrice: '1000',
          status: 'ON_SHELF'
        })
      )

      const inactiveSpecGroupId = `sg_inactive_${suffix}`
      const inactiveOptionId = `opt_inactive_${suffix}`
      await repoSg.save(
        repoSg.create({
          specGroupId: inactiveSpecGroupId,
          goodId: `good_${suffix}`,
          name: '停用规格组',
          isRequired: 1,
          minSelection: 1,
          maxSelection: 1,
          sort: 0,
          status: 'INACTIVE'
        })
      )
      await repoSo.save(
        repoSo.create({
          optionId: inactiveOptionId,
          specGroupId: inactiveSpecGroupId,
          name: '停用规格值',
          priceCents: '0',
          sort: 0,
          status: 'INACTIVE'
        })
      )

      const sharedSpecGroupId = `ssg_${suffix}`
      const optionId = `sso_${suffix}`
      await repoSsg.save(
        repoSsg.create({
          sharedSpecGroupId,
          storeId: 'store_default',
          name: '加料',
          isRequired: 1,
          minSelection: 1,
          maxSelection: 1,
          sort: 0,
          defaultOptionIds: JSON.stringify([optionId]),
          status: 'ACTIVE'
        })
      )
      await repoSso.save(
        repoSso.create({
          optionId,
          sharedSpecGroupId,
          name: '珍珠',
          priceCents: '100',
          sort: 0,
          status: 'ACTIVE'
        })
      )
      const inactiveSharedSpecGroupId = `ssg_inactive_${suffix}`
      const inactiveSharedOptionId = `sso_inactive_${suffix}`
      await repoSsg.save(
        repoSsg.create({
          sharedSpecGroupId: inactiveSharedSpecGroupId,
          storeId: 'store_default',
          name: '停用共享组',
          isRequired: 0,
          minSelection: 0,
          maxSelection: 1,
          sort: 0,
          defaultOptionIds: null,
          status: 'INACTIVE'
        })
      )
      await repoSso.save(
        repoSso.create({
          optionId: inactiveSharedOptionId,
          sharedSpecGroupId: inactiveSharedSpecGroupId,
          name: '停用共享值',
          priceCents: '0',
          sort: 0,
          status: 'INACTIVE'
        })
      )
      await repoLink.save(
        repoLink.create({ storeId: 'store_default', goodId: `good_${suffix}`, sharedSpecGroupId, sort: 10 })
      )

      const { resp, json } = await jsonFetch(`${base}/api/v1/stores/export?includeInactive=1`, {
        headers: storeAdminAuthz(token)
      })
      assert.equal(resp.status, 200)
      assert.equal(json.success, true)
      assert.ok(captured && captured.body)
      const exported = JSON.parse(String(captured.body))
      assert.ok(exported.categories.some((c) => c.categoryId === inactiveCategoryId))
      assert.ok(exported.specGroups.some((g) => g.specGroupId === inactiveSpecGroupId))
      assert.ok(exported.specOptions.some((o) => o.optionId === inactiveOptionId))
      assert.ok(exported.sharedSpecGroups.some((g) => g.sharedSpecGroupId === inactiveSharedSpecGroupId))
      assert.ok(exported.sharedSpecOptions.some((o) => o.optionId === inactiveSharedOptionId))
    },
    async () => {
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async (params) => {
        captured = params
        return { ETag: '"etag"', Location: `cos://${params.key}` }
      }
    },
    async () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    }
  )
})

test('store import restores shared spec groups and links', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const suffix = String(Date.now())
    const token = await getDevToken(base, 'ADMIN')
    const repoSsg = AppDataSource.getRepository(require('../dist/entities/SharedSpecGroup').SharedSpecGroup)
    const repoSso = AppDataSource.getRepository(require('../dist/entities/SharedSpecOption').SharedSpecOption)
    const repoLink = AppDataSource.getRepository(require('../dist/entities/GoodSharedSpecGroup').GoodSharedSpecGroup)

    const sharedSpecGroupId = `ssg_${suffix}`
    const optionId = `sso_${suffix}`
    const goodId = `good_${suffix}`
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      store: { storeId: 'store_default', name: '恢复门店', logoUrl: '', phone: '', address: '', description: '' },
      categories: [{ categoryId: `cat_${suffix}`, storeId: 'store_default', name: '饮品', sort: 10, status: 'ACTIVE' }],
      goods: [
        {
          goodId,
          storeId: 'store_default',
          categoryId: `cat_${suffix}`,
          categoryIds: [`cat_${suffix}`],
          name: '奶茶',
          description: '',
          detailMarkdown: null,
          imageUrl: '',
          imageUrls: null,
          sales: 0,
          basePrice: '1000',
          status: 'ON_SHELF'
        }
      ],
      skus: [
        {
          skuId: `sku_${suffix}`,
          goodId,
          specCombination: '默认',
          specKey: null,
          specSignature: null,
          price: '1000',
          stock: 9,
          status: 'ON_SHELF'
        }
      ],
      specGroups: [],
      specOptions: [],
      sharedSpecGroups: [
        {
          sharedSpecGroupId,
          storeId: 'store_default',
          name: '加料',
          description: '提示',
          isRequired: 1,
          minSelection: 1,
          maxSelection: 1,
          sort: 0,
          defaultOptionIds: [optionId],
          status: 'ACTIVE'
        }
      ],
      sharedSpecOptions: [{ optionId, sharedSpecGroupId, name: '珍珠', priceCents: '100', sort: 0, status: 'ACTIVE' }],
      goodSharedSpecGroups: [
        {
          storeId: 'store_default',
          goodId,
          sharedSpecGroupId,
          disabledOptionIds: [],
          defaultOptionIds: [optionId],
          sort: 10
        }
      ],
      tables: []
    }

    const form = new FormData()
    form.append('file', new Blob([Buffer.from(JSON.stringify(payload))], { type: 'application/json' }), 'store.json')
    const { resp, json } = await jsonFetch(`${base}/api/v1/stores/import`, {
      method: 'POST',
      headers: storeAdminAuthz(token),
      body: form
    })
    assert.equal(resp.status, 200)
    assert.equal(json.success, true)

    const groups = await repoSsg.find({ where: { storeId: 'store_default', name: '加料' } })
    assert.equal(groups.length, 1)
    assert.equal(groups[0].description, '提示')
    const newGroupId = groups[0].sharedSpecGroupId
    const opts = await repoSso.find({ where: { sharedSpecGroupId: newGroupId } })
    assert.equal(opts.length, 1)
    const links = await repoLink.find({ where: { sharedSpecGroupId: newGroupId } })
    assert.equal(links.length, 1)
    const repoGood = AppDataSource.getRepository(require('../dist/entities/Good').Good)
    const linkedGood = await repoGood.findOne({ where: { goodId: links[0].goodId } })
    assert.ok(linkedGood)
    assert.equal(linkedGood.name, '奶茶')
  })
})
