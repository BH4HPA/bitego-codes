const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer } = require('./testUtils')

test('store sync updates existing good without overriding sku stock/status', async () => {
  await withServer(async (ctx) => {
    const Category = require('../dist/entities/Category').Category
    const Good = require('../dist/entities/Good').Good
    const GoodCategory = require('../dist/entities/GoodCategory').GoodCategory
    const SharedSpecGroup = require('../dist/entities/SharedSpecGroup').SharedSpecGroup
    const SharedSpecOption = require('../dist/entities/SharedSpecOption').SharedSpecOption
    const GoodSharedSpecGroup = require('../dist/entities/GoodSharedSpecGroup').GoodSharedSpecGroup
    const SpecGroup = require('../dist/entities/SpecGroup').SpecGroup
    const SpecOption = require('../dist/entities/SpecOption').SpecOption
    const SKU = require('../dist/entities/SKU').SKU
    const { syncSharedCatalogForStore } = require('../dist/services/storeSyncService')

    const sourceStoreId = `p_${Date.now()}`
    const targetStoreId = `s_${Date.now()}`

    const catRepo = ctx.AppDataSource.getRepository(Category)
    const goodRepo = ctx.AppDataSource.getRepository(Good)
    const gcRepo = ctx.AppDataSource.getRepository(GoodCategory)
    const ssgRepo = ctx.AppDataSource.getRepository(SharedSpecGroup)
    const ssoRepo = ctx.AppDataSource.getRepository(SharedSpecOption)
    const gssgRepo = ctx.AppDataSource.getRepository(GoodSharedSpecGroup)
    const sgRepo = ctx.AppDataSource.getRepository(SpecGroup)
    const soRepo = ctx.AppDataSource.getRepository(SpecOption)
    const skuRepo = ctx.AppDataSource.getRepository(SKU)

    const catSrcId = `cat_${Date.now()}`
    const catTgtId = `cat_${Date.now()}_t`
    await catRepo.save(
      catRepo.create({
        categoryId: catSrcId,
        storeId: sourceStoreId,
        templateId: catSrcId,
        name: '饮品',
        subtitle: null,
        badgeText: null,
        sort: 10,
        status: 'ACTIVE'
      })
    )
    await catRepo.save(
      catRepo.create({
        categoryId: catTgtId,
        storeId: targetStoreId,
        templateId: catSrcId,
        name: '饮品',
        subtitle: null,
        badgeText: null,
        sort: 10,
        status: 'ACTIVE'
      })
    )

    const ssgSrcId = `ssg_${Date.now()}`
    const ssgTgtId = `ssg_${Date.now()}_t`
    const soSrc1 = `o_${Date.now()}_1`
    const soSrc2 = `o_${Date.now()}_2`
    const soTgt1 = `o_${Date.now()}_t1`
    const soTgt2 = `o_${Date.now()}_t2`
    await ssgRepo.save(
      ssgRepo.create({
        sharedSpecGroupId: ssgSrcId,
        storeId: sourceStoreId,
        templateId: ssgSrcId,
        name: '温度',
        description: null,
        isRequired: 1,
        minSelection: 1,
        maxSelection: 1,
        sort: 10,
        defaultOptionIds: null,
        status: 'ACTIVE'
      })
    )
    await ssoRepo.save(
      ssoRepo.create({
        optionId: soSrc1,
        sharedSpecGroupId: ssgSrcId,
        templateId: soSrc1,
        name: '热',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await ssoRepo.save(
      ssoRepo.create({
        optionId: soSrc2,
        sharedSpecGroupId: ssgSrcId,
        templateId: soSrc2,
        name: '冰',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await ssgRepo.save(
      ssgRepo.create({
        sharedSpecGroupId: ssgTgtId,
        storeId: targetStoreId,
        templateId: ssgSrcId,
        name: '温度',
        description: null,
        isRequired: 1,
        minSelection: 1,
        maxSelection: 1,
        sort: 10,
        defaultOptionIds: null,
        status: 'ACTIVE'
      })
    )
    await ssoRepo.save(
      ssoRepo.create({
        optionId: soTgt1,
        sharedSpecGroupId: ssgTgtId,
        templateId: soSrc1,
        name: '热',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await ssoRepo.save(
      ssoRepo.create({
        optionId: soTgt2,
        sharedSpecGroupId: ssgTgtId,
        templateId: soSrc2,
        name: '冰',
        sort: 0,
        status: 'ACTIVE'
      })
    )

    const goodSrcId = `good_${Date.now()}`
    const goodTgtId = `good_${Date.now()}_t`
    await goodRepo.save(
      goodRepo.create({
        goodId: goodSrcId,
        storeId: sourceStoreId,
        templateId: goodSrcId,
        categoryId: catSrcId,
        defaultSkuId: null,
        name: '美式咖啡',
        description: 'x',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '100',
        status: 'ON_SHELF'
      })
    )
    await gcRepo.save(gcRepo.create({ storeId: sourceStoreId, goodId: goodSrcId, categoryId: catSrcId, sort: 10 }))
    await gssgRepo.save(
      gssgRepo.create({
        storeId: sourceStoreId,
        goodId: goodSrcId,
        sharedSpecGroupId: ssgSrcId,
        disabledOptionIds: JSON.stringify([soSrc2]),
        defaultOptionIds: JSON.stringify([soSrc1]),
        sort: 10
      })
    )

    const sgSrcId = `og_${Date.now()}`
    const sgTgtId = `og_${Date.now()}_t`
    const optSrcId = `op_${Date.now()}_1`
    const optTgtId = `op_${Date.now()}_t1`
    const optSrcId2 = `op_${Date.now()}_2`
    const optTgtExtraId = `op_${Date.now()}_tx`
    await sgRepo.save(
      sgRepo.create({
        specGroupId: sgSrcId,
        templateId: sgSrcId,
        goodId: goodSrcId,
        name: '杯型',
        isRequired: 1,
        minSelection: 1,
        maxSelection: 1,
        sort: 10,
        isStock: 1,
        defaultOptionIds: JSON.stringify([optSrcId]),
        status: 'ACTIVE'
      })
    )
    await soRepo.save(
      soRepo.create({
        optionId: optSrcId,
        templateId: optSrcId,
        specGroupId: sgSrcId,
        name: '中杯',
        priceCents: '0',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await soRepo.save(
      soRepo.create({
        optionId: optSrcId2,
        templateId: optSrcId2,
        specGroupId: sgSrcId,
        name: '大杯',
        priceCents: '20',
        sort: 0,
        status: 'ACTIVE'
      })
    )

    await goodRepo.save(
      goodRepo.create({
        goodId: goodTgtId,
        storeId: targetStoreId,
        templateId: goodSrcId,
        categoryId: catTgtId,
        defaultSkuId: null,
        name: 'Old',
        description: 'old',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 0,
        basePrice: '90',
        status: 'ON_SHELF'
      })
    )
    await gcRepo.save(gcRepo.create({ storeId: targetStoreId, goodId: goodTgtId, categoryId: catTgtId, sort: 10 }))
    await gssgRepo.save(
      gssgRepo.create({
        storeId: targetStoreId,
        goodId: goodTgtId,
        sharedSpecGroupId: ssgTgtId,
        disabledOptionIds: JSON.stringify([soTgt1]),
        defaultOptionIds: JSON.stringify([soTgt2]),
        sort: 10
      })
    )
    await sgRepo.save(
      sgRepo.create({
        specGroupId: sgTgtId,
        templateId: sgSrcId,
        goodId: goodTgtId,
        name: '杯型',
        isRequired: 1,
        minSelection: 1,
        maxSelection: 1,
        sort: 10,
        isStock: 1,
        defaultOptionIds: JSON.stringify([optTgtId]),
        status: 'ACTIVE'
      })
    )
    await soRepo.save(
      soRepo.create({
        optionId: optTgtId,
        templateId: optSrcId,
        specGroupId: sgTgtId,
        name: '中杯',
        priceCents: '0',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await soRepo.save(
      soRepo.create({
        optionId: optTgtExtraId,
        templateId: `extra_${Date.now()}`,
        specGroupId: sgTgtId,
        name: '超大杯',
        priceCents: '999',
        sort: 0,
        status: 'ACTIVE'
      })
    )

    const sku = await skuRepo.save(
      skuRepo.create({
        skuId: `sku_${Date.now()}_t`,
        goodId: goodTgtId,
        specCombination: '杯型:中杯',
        specKey: 'k',
        specSignature: `${sgTgtId}:${optTgtId}`,
        price: '90',
        stock: 5,
        status: 'ON_SHELF'
      })
    )
    await skuRepo.save(
      skuRepo.create({
        skuId: `sku_${Date.now()}_tx`,
        goodId: goodTgtId,
        specCombination: '杯型:超大杯',
        specKey: 'k2',
        specSignature: `${sgTgtId}:${optTgtExtraId}`,
        price: '1089',
        stock: 3,
        status: 'ON_SHELF'
      })
    )
    await goodRepo.update({ goodId: goodTgtId }, { defaultSkuId: `missing_${Date.now()}` })

    await goodRepo.update({ goodId: goodSrcId }, { basePrice: '120', name: '美式咖啡2' })
    await soRepo.update({ optionId: optSrcId }, { priceCents: '10' })
    await gssgRepo.update(
      { storeId: sourceStoreId, goodId: goodSrcId, sharedSpecGroupId: ssgSrcId },
      { disabledOptionIds: JSON.stringify([soSrc1]), defaultOptionIds: JSON.stringify([soSrc2]) }
    )

    await ctx.AppDataSource.transaction(async (manager) => {
      await syncSharedCatalogForStore({ manager, sourceStoreId, targetStoreId })
    })

    const tgtGood = await goodRepo.findOne({ where: { goodId: goodTgtId } })
    assert.ok(tgtGood)
    assert.equal(tgtGood.name, '美式咖啡2')
    assert.equal(tgtGood.basePrice, '120')
    assert.equal(tgtGood.status, 'ON_SHELF')

    const tgtSkus = await skuRepo.find({ where: { goodId: goodTgtId } })
    assert.ok(tgtSkus.length >= 2)
    const mid = tgtSkus.find((s) => s.specSignature === `${sgTgtId}:${optTgtId}`)
    assert.ok(mid)
    assert.equal(mid.stock, 5)
    assert.equal(mid.status, 'ON_SHELF')
    assert.equal(mid.price, '130')

    const extra = tgtSkus.find((s) => s.specSignature === `${sgTgtId}:${optTgtExtraId}`)
    assert.ok(extra)
    assert.equal(extra.stock, 3)
    assert.equal(extra.status, 'OFF_SHELF')

    const added = tgtSkus.find(
      (s) =>
        s.specSignature !== `${sgTgtId}:${optTgtId}` &&
        s.specSignature !== `${sgTgtId}:${optTgtExtraId}` &&
        s.status === 'OFF_SHELF' &&
        s.stock === 0
    )
    assert.ok(added)
    assert.equal(Number(added.price), 140)

    const tgtGood2 = await goodRepo.findOne({ where: { goodId: goodTgtId } })
    assert.ok(tgtGood2)
    assert.notEqual(tgtGood2.defaultSkuId, null)
    assert.ok(!String(tgtGood2.defaultSkuId).startsWith('missing_'))

    const tgtLinks = await gssgRepo.find({ where: { storeId: targetStoreId, goodId: goodTgtId } })
    assert.equal(tgtLinks.length, 1)
    const d = JSON.parse(tgtLinks[0].disabledOptionIds || '[]')
    const def = JSON.parse(tgtLinks[0].defaultOptionIds || '[]')
    assert.deepEqual(d, [soTgt1])
    assert.deepEqual(def, [soTgt2])
  })
})
