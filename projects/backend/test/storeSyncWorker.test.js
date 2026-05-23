const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('tenant sync shared catalog enqueues jobs and worker applies to target store', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Category = require('../dist/entities/Category').Category
    const Good = require('../dist/entities/Good').Good
    const GoodCategory = require('../dist/entities/GoodCategory').GoodCategory
    const SpecGroup = require('../dist/entities/SpecGroup').SpecGroup
    const SpecOption = require('../dist/entities/SpecOption').SpecOption
    const SKU = require('../dist/entities/SKU').SKU
    const SharedSpecGroup = require('../dist/entities/SharedSpecGroup').SharedSpecGroup
    const SharedSpecOption = require('../dist/entities/SharedSpecOption').SharedSpecOption
    const StoreSyncJob = require('../dist/entities/StoreSyncJob').StoreSyncJob
    const Notification = require('../dist/entities/Notification').Notification
    const { runStoreSyncWorkerOnce } = require('../dist/workers/storeSyncWorker')

    const tenantId = `t_${Date.now()}`
    const primaryStoreId = `p_${Date.now()}`
    const subStoreId = `c_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: primaryStoreId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'P',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: subStoreId,
        tenantId,
        isPrimary: 0,
        subName: 'C',
        name: 'C',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const adminUserId = `admin_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', adminUserId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId: adminUserId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const catRepo = ctx.AppDataSource.getRepository(Category)
    await catRepo.save(
      catRepo.create({
        categoryId: `cat_${Date.now()}`,
        storeId: primaryStoreId,
        templateId: null,
        name: '饮品',
        subtitle: null,
        badgeText: null,
        sort: 10,
        status: 'ACTIVE'
      })
    )
    const createdCat = await catRepo.findOne({ where: { storeId: primaryStoreId, name: '饮品' } })
    createdCat.templateId = createdCat.categoryId
    await catRepo.save(createdCat)

    const goodRepo = ctx.AppDataSource.getRepository(Good)
    const goodCatRepo = ctx.AppDataSource.getRepository(GoodCategory)
    const sgRepo = ctx.AppDataSource.getRepository(SpecGroup)
    const soRepo = ctx.AppDataSource.getRepository(SpecOption)
    const skuRepo = ctx.AppDataSource.getRepository(SKU)

    const srcGood = await goodRepo.save(
      goodRepo.create({
        goodId: `good_${Date.now()}`,
        storeId: primaryStoreId,
        templateId: null,
        categoryId: createdCat.categoryId,
        defaultSkuId: null,
        name: '美式咖啡',
        description: 'x',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 10,
        basePrice: '100',
        status: 'ON_SHELF'
      })
    )
    srcGood.templateId = srcGood.goodId
    await goodRepo.save(srcGood)
    await goodCatRepo.save(
      goodCatRepo.create({
        storeId: primaryStoreId,
        goodId: srcGood.goodId,
        categoryId: createdCat.categoryId,
        sort: 10
      })
    )
    const sg = await sgRepo.save(
      sgRepo.create({
        specGroupId: `og_${Date.now()}`,
        templateId: null,
        goodId: srcGood.goodId,
        name: '杯型',
        isRequired: 1,
        minSelection: 1,
        maxSelection: 1,
        sort: 10,
        isStock: 1,
        defaultOptionIds: null,
        status: 'ACTIVE'
      })
    )
    sg.templateId = sg.specGroupId
    await sgRepo.save(sg)
    const op1 = await soRepo.save(
      soRepo.create({
        optionId: `op_${Date.now()}_1`,
        templateId: null,
        specGroupId: sg.specGroupId,
        name: '中杯',
        priceCents: '0',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    op1.templateId = op1.optionId
    await soRepo.save(op1)

    const ssgRepo = ctx.AppDataSource.getRepository(SharedSpecGroup)
    const ssoRepo = ctx.AppDataSource.getRepository(SharedSpecOption)
    const g = ssgRepo.create({
      sharedSpecGroupId: `ssg_${Date.now()}`,
      storeId: primaryStoreId,
      templateId: null,
      name: '温度',
      description: null,
      isRequired: 1,
      minSelection: 1,
      maxSelection: 1,
      sort: 10,
      defaultOptionIds: null,
      status: 'ACTIVE'
    })
    await ssgRepo.save(g)
    g.templateId = g.sharedSpecGroupId
    await ssgRepo.save(g)

    const o1 = ssoRepo.create({
      optionId: `o_${Date.now()}_1`,
      sharedSpecGroupId: g.sharedSpecGroupId,
      templateId: null,
      name: '热',
      sort: 0,
      status: 'ACTIVE'
    })
    const o2 = ssoRepo.create({
      optionId: `o_${Date.now()}_2`,
      sharedSpecGroupId: g.sharedSpecGroupId,
      templateId: null,
      name: '冰',
      sort: 0,
      status: 'ACTIVE'
    })
    await ssoRepo.save([o1, o2])
    o1.templateId = o1.optionId
    o2.templateId = o2.optionId
    await ssoRepo.save([o1, o2])

    const { resp, json } = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, primaryStoreId), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(resp.status, 202)
    assert.ok(json.data.batchId)

    const jobRepo = ctx.AppDataSource.getRepository(StoreSyncJob)
    const jobs = await jobRepo.find({ where: { tenantId, sourceStoreId: primaryStoreId } })
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].targetStoreId, subStoreId)

    await runStoreSyncWorkerOnce()

    const subCats = await catRepo.find({ where: { storeId: subStoreId } })
    assert.equal(subCats.length, 1)
    assert.equal(subCats[0].templateId, createdCat.categoryId)
    assert.equal(subCats[0].name, '饮品')

    const subGroups = await ssgRepo.find({ where: { storeId: subStoreId } })
    assert.equal(subGroups.length, 1)
    assert.equal(subGroups[0].templateId, g.sharedSpecGroupId)
    assert.equal(subGroups[0].name, '温度')
    const subOptions = await ssoRepo.find({ where: { sharedSpecGroupId: subGroups[0].sharedSpecGroupId } })
    assert.equal(subOptions.length, 2)

    const subGoods = await goodRepo.find({ where: { storeId: subStoreId } })
    assert.equal(subGoods.length, 1)
    assert.equal(subGoods[0].templateId, srcGood.goodId)
    assert.equal(subGoods[0].name, '美式咖啡')
    assert.equal(subGoods[0].status, 'OFF_SHELF')
    const subSkus = await skuRepo.find({ where: { goodId: subGoods[0].goodId } })
    assert.ok(subSkus.length >= 1)
    for (const s of subSkus) {
      assert.equal(s.status, 'OFF_SHELF')
      assert.equal(s.stock, 0)
    }

    const ntfRepo = ctx.AppDataSource.getRepository(Notification)
    const applied = await ntfRepo.find({ where: { type: 'STORE_SYNC_APPLIED', storeId: subStoreId } })
    assert.equal(applied.length, 1)
    const batchDone = await ntfRepo.find({ where: { type: 'STORE_SYNC_BATCH_FINISHED', tenantId, storeId: null } })
    assert.equal(batchDone.length, 1)
  })
})
