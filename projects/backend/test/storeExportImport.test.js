const test = require('node:test')
const assert = require('node:assert/strict')
const { In } = require('typeorm')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'bitego-secret'
process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'

const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('store export uploads json to cos and zeros sales', async () => {
  let captured = null
  let originalPut
  await withServer(
    async ({ base, AppDataSource }) => {
      const suffix = String(Date.now())
      const token = await getDevToken(base, 'ADMIN')
      const repoStore = AppDataSource.getRepository(require('../dist/entities/Store').Store)
      const repoCat = AppDataSource.getRepository(require('../dist/entities/Category').Category)
      const repoGood = AppDataSource.getRepository(require('../dist/entities/Good').Good)
      const repoSku = AppDataSource.getRepository(require('../dist/entities/SKU').SKU)
      const repoGroup = AppDataSource.getRepository(require('../dist/entities/SpecGroup').SpecGroup)
      const repoOpt = AppDataSource.getRepository(require('../dist/entities/SpecOption').SpecOption)
      const repoTable = AppDataSource.getRepository(require('../dist/entities/Table').Table)

      const existingStore = await repoStore.findOne({ where: { storeId: 'store_default' } })
      if (existingStore) {
        existingStore.name = `测试门店_${suffix}`
        await repoStore.save(existingStore)
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
      await repoGood.save(
        repoGood.create({
          goodId: `good_${suffix}`,
          storeId: 'store_default',
          categoryId: `cat_${suffix}`,
          name: '奶茶',
          description: '',
          detailMarkdown: null,
          imageUrl: '',
          imageUrls: null,
          sales: 123,
          basePrice: '1000',
          status: 'ON_SHELF'
        })
      )
      await repoSku.save(
        repoSku.create({
          skuId: `sku_${suffix}`,
          goodId: `good_${suffix}`,
          specCombination: '默认',
          specKey: null,
          specSignature: null,
          price: '1000',
          stock: 9,
          status: 'ON_SHELF'
        })
      )
      await repoGroup.save(
        repoGroup.create({
          specGroupId: `sg_${suffix}`,
          goodId: `good_${suffix}`,
          name: '甜度',
          isRequired: 1,
          minSelection: 1,
          maxSelection: 1,
          sort: 0,
          status: 'ACTIVE'
        })
      )
      await repoOpt.save(
        repoOpt.create({
          optionId: `opt_${suffix}`,
          specGroupId: `sg_${suffix}`,
          name: '少糖',
          priceCents: '0',
          sort: 0,
          status: 'ACTIVE'
        })
      )
      await repoTable.save(
        repoTable.create({
          tableId: `tbl_${suffix}`,
          storeId: 'store_default',
          code: 'A01',
          status: 'FREE',
          sessionVersion: 1,
          sessionClosedAt: null,
          qrcodeUrl: null
        })
      )

      const { resp, json } = await jsonFetch(`${base}/api/v1/stores/export`, { headers: storeAdminAuthz(token) })
      assert.equal(resp.status, 200)
      assert.equal(json.success, true)
      assert.ok(json.data.publicUrl.startsWith('https://cdn.example.com/'))
      assert.ok(captured && captured.key && captured.body)

      const exported = JSON.parse(String(captured.body))
      assert.equal(exported.version, 2)
      assert.ok(String(exported.store.name || '').startsWith('测试门店_'))
      assert.equal(exported.goods[0].sales, 0)
      assert.ok(Array.isArray(exported.goods[0].categoryIds))
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

test('store import restores config and clears orders/customers but keeps admins', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const suffix = String(Date.now())
    const token = await getDevToken(base, 'ADMIN')
    const repoUser = AppDataSource.getRepository(require('../dist/entities/User').User)
    const repoOrder = AppDataSource.getRepository(require('../dist/entities/Order').Order)
    const repoOrderItem = AppDataSource.getRepository(require('../dist/entities/OrderItem').OrderItem)
    const repoCat = AppDataSource.getRepository(require('../dist/entities/Category').Category)
    const repoGood = AppDataSource.getRepository(require('../dist/entities/Good').Good)
    const repoTable = AppDataSource.getRepository(require('../dist/entities/Table').Table)

    const adminBefore = await repoUser.count({ where: { userType: 'ADMIN' } })

    await repoUser.save(
      repoUser.create({
        userId: `usr_${suffix}`,
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: `o${suffix}`,
        wechatUnionid: null,
        nickname: '小明',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    const customersBefore = await repoUser.count({ where: { userType: 'CUSTOMER' } })
    await repoOrder.save(
      repoOrder.create({
        orderId: `ord_${suffix}`,
        orderNo: `O${suffix}`,
        storeId: 'store_default',
        tableId: 'tbl_1',
        tableSessionVersion: 1,
        userId: `usr_${suffix}`,
        status: 'Paid',
        paymentMethod: 'WECHAT',
        remark: null,
        totalAmount: '1000',
        paidAmount: '1000',
        refundedAmount: null,
        paidAt: new Date(),
        completedAt: null,
        canceledAt: null,
        refundedAt: null
      })
    )
    await repoOrderItem.save(
      repoOrderItem.create({
        orderItemId: `oi_${suffix}`,
        orderId: `ord_${suffix}`,
        skuId: 'sku_1',
        goodId: 'good_1',
        goodNameSnapshot: '奶茶',
        specTextSnapshot: '默认',
        unitPriceSnapshot: '1000',
        qty: 1,
        servedQty: 0,
        addedByUserId: `usr_${suffix}`,
        addedByNicknameSnapshot: '小明',
        addedByAvatarSnapshot: ''
      })
    )

    await repoCat.save(
      repoCat.create({
        categoryId: `cat_old_${suffix}`,
        storeId: 'store_default',
        name: '旧分类',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await repoGood.save(
      repoGood.create({
        goodId: `good_old_${suffix}`,
        storeId: 'store_default',
        categoryId: `cat_old_${suffix}`,
        name: '旧菜品',
        description: '',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 99,
        basePrice: '1000',
        status: 'ON_SHELF'
      })
    )
    await repoTable.save(
      repoTable.create({
        tableId: `tbl_old_${suffix}`,
        storeId: 'store_default',
        code: 'B01',
        status: 'OCCUPIED',
        sessionVersion: 7,
        sessionClosedAt: null,
        qrcodeUrl: null
      })
    )

    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      store: { storeId: 'store_default', name: '恢复门店', logoUrl: '', phone: '', address: '', description: '' },
      categories: [{ categoryId: 'cat_1', storeId: 'store_default', name: '饮品', sort: 10, status: 'ACTIVE' }],
      goods: [
        {
          goodId: 'good_1',
          storeId: 'store_default',
          categoryId: 'cat_1',
          categoryIds: ['cat_1'],
          name: '奶茶',
          description: '',
          detailMarkdown: null,
          imageUrl: '',
          imageUrls: null,
          sales: 999,
          basePrice: '1000',
          status: 'ON_SHELF'
        }
      ],
      skus: [
        {
          skuId: 'sku_1',
          goodId: 'good_1',
          specCombination: '默认',
          specKey: null,
          specSignature: null,
          price: '1000',
          stock: 9,
          status: 'ON_SHELF'
        }
      ],
      specGroups: [
        {
          specGroupId: 'sg_1',
          goodId: 'good_1',
          name: '甜度',
          isRequired: 1,
          minSelection: 1,
          maxSelection: 1,
          sort: 0,
          status: 'ACTIVE'
        }
      ],
      specOptions: [
        { optionId: 'opt_1', specGroupId: 'sg_1', name: '少糖', priceCents: '0', sort: 0, status: 'ACTIVE' }
      ],
      tables: [{ tableId: 'tbl_1', storeId: 'store_default', code: 'A01', qrcodeUrl: null }]
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

    const ordersLeft = await repoOrder.count({ where: { storeId: 'store_default' } })
    const orderIdsLeft = (await repoOrder.find({ select: { orderId: true }, where: { storeId: 'store_default' } })).map(
      (o) => o.orderId
    )
    const orderItemsLeft = orderIdsLeft.length ? await repoOrderItem.count({ where: { orderId: In(orderIdsLeft) } }) : 0
    assert.equal(ordersLeft, 0)
    assert.equal(orderItemsLeft, 0)

    const adminLeft = await repoUser.count({ where: { userType: 'ADMIN' } })
    const customersLeft = await repoUser.count({ where: { userType: 'CUSTOMER' } })
    assert.equal(adminLeft, adminBefore)
    assert.equal(customersLeft, customersBefore)

    const goods = await repoGood.find({ where: { storeId: 'store_default' } })
    assert.equal(goods.length, 1)
    assert.equal(goods[0].sales, 0)

    const t = await repoTable.findOne({ where: { storeId: 'store_default', code: 'A01' } })
    assert.ok(t)
    assert.equal(t.status, 'FREE')
    assert.equal(t.sessionVersion, 1)
  })
})

test('store reset clears config and history but keeps admins', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const suffix = String(Date.now())
    const token = await getDevToken(base, 'ADMIN')
    const repoUser = AppDataSource.getRepository(require('../dist/entities/User').User)
    const repoCat = AppDataSource.getRepository(require('../dist/entities/Category').Category)
    const repoGood = AppDataSource.getRepository(require('../dist/entities/Good').Good)
    const repoSku = AppDataSource.getRepository(require('../dist/entities/SKU').SKU)
    const repoOrder = AppDataSource.getRepository(require('../dist/entities/Order').Order)
    const repoStore = AppDataSource.getRepository(require('../dist/entities/Store').Store)

    const adminBefore = await repoUser.count({ where: { userType: 'ADMIN' } })

    const existingStore = await repoStore.findOne({ where: { storeId: 'store_default' } })
    if (existingStore) {
      existingStore.name = `旧门店_${suffix}`
      existingStore.logoUrl = 'x'
      existingStore.phone = '1'
      existingStore.address = '2'
      existingStore.description = '3'
      await repoStore.save(existingStore)
    }
    await repoCat.save(
      repoCat.create({
        categoryId: `cat_old_${suffix}`,
        storeId: 'store_default',
        name: '旧分类',
        sort: 0,
        status: 'ACTIVE'
      })
    )
    await repoGood.save(
      repoGood.create({
        goodId: `good_old_${suffix}`,
        storeId: 'store_default',
        categoryId: `cat_old_${suffix}`,
        name: '旧菜品',
        description: '',
        detailMarkdown: null,
        imageUrl: '',
        imageUrls: null,
        sales: 7,
        basePrice: '1000',
        status: 'ON_SHELF'
      })
    )
    await repoSku.save(
      repoSku.create({
        skuId: `sku_old_${suffix}`,
        goodId: `good_old_${suffix}`,
        specCombination: '默认',
        specKey: null,
        specSignature: null,
        price: '1000',
        stock: 9,
        status: 'ON_SHELF'
      })
    )
    await repoUser.save(
      repoUser.create({
        userId: `usr_${suffix}`,
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: `o${suffix}`,
        wechatUnionid: null,
        nickname: '小明',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    const customersBefore = await repoUser.count({ where: { userType: 'CUSTOMER' } })
    await repoOrder.save(
      repoOrder.create({
        orderId: `ord_${suffix}`,
        orderNo: `O${suffix}`,
        storeId: 'store_default',
        tableId: null,
        tableSessionVersion: null,
        userId: `usr_${suffix}`,
        status: 'Paid',
        paymentMethod: 'WECHAT',
        remark: null,
        totalAmount: '1000',
        paidAmount: '1000',
        refundedAmount: null,
        paidAt: new Date(),
        completedAt: null,
        canceledAt: null,
        refundedAt: null
      })
    )

    const { resp, json } = await jsonFetch(`${base}/api/v1/stores/reset`, {
      method: 'POST',
      headers: storeAdminAuthz(token)
    })
    assert.equal(resp.status, 200)
    assert.equal(json.success, true)
    assert.equal(json.data.counts.categories, 0)
    assert.equal(json.data.counts.goods, 0)

    assert.equal(await repoCat.count({ where: { storeId: 'store_default' } }), 0)
    assert.equal(await repoGood.count({ where: { storeId: 'store_default' } }), 0)
    const skusLeft = await repoSku
      .createQueryBuilder('s')
      .innerJoin('goods', 'g', 'g.goodId = s.goodId')
      .where('g.storeId = :storeId', { storeId: 'store_default' })
      .getCount()
    assert.equal(skusLeft, 0)
    assert.equal(await repoOrder.count({ where: { storeId: 'store_default' } }), 0)

    const adminLeft = await repoUser.count({ where: { userType: 'ADMIN' } })
    const customersLeft = await repoUser.count({ where: { userType: 'CUSTOMER' } })
    assert.equal(adminLeft, adminBefore)
    assert.equal(customersLeft, customersBefore)

    const store = await repoStore.findOne({ where: { storeId: 'store_default' } })
    assert.ok(store)
    assert.equal(store.name, 'BiteGo 门店')
  })
})
