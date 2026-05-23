const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, makeRequestId, bearerAuthz } = require('./testUtils')

test('backend smoke', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`

    const health = await fetch(`${base}/health`)
    assert.equal(health.status, 200)
    assert.equal(await health.text(), 'OK')

    const adminToken = await getDevToken(base, 'ADMIN')
    assert.ok(adminToken)

    const { TableCart } = require('../dist/entities/TableCart')
    const { TableCartItem } = require('../dist/entities/TableCartItem')
    const { Table } = require('../dist/entities/Table')
    const { SKU } = require('../dist/entities/SKU')
    const { Good } = require('../dist/entities/Good')

    const tableRepo = AppDataSource.getRepository(Table)
    const goodRepo = AppDataSource.getRepository(Good)
    const skuRepo = AppDataSource.getRepository(SKU)
    const cartRepo = AppDataSource.getRepository(TableCart)
    const cartItemRepo = AppDataSource.getRepository(TableCartItem)

    let t = await tableRepo.findOne({ where: { tableId: 'A01' } })
    if (!t) {
      t = tableRepo.create({
        tableId: 'A01',
        storeId: 'store_default',
        code: 'A01',
        status: 'FREE',
        sessionVersion: 1,
        sessionClosedAt: null
      })
      await tableRepo.save(t)
    }

    const tableResp = await fetch(`${base}/api/v1/tables/A01`)
    assert.equal(tableResp.status, 200)
    const tableJson = await tableResp.json()
    assert.ok(tableJson.data.sessionToken)

    const goodId = `good_test_${suffix}`
    const skuId = `sku_test_${suffix}`
    const g = goodRepo.create({
      goodId,
      storeId: 'store_default',
      categoryId: 'cat_test',
      name: '测试菜品',
      description: '',
      imageUrl: '',
      sales: 0,
      status: 'ON_SHELF'
    })
    await goodRepo.save(g)
    const s = skuRepo.create({
      skuId,
      goodId: g.goodId,
      specCombination: '默认',
      price: '1000',
      stock: 100,
      status: 'ON_SHELF'
    })
    await skuRepo.save(s)

    let cart = await cartRepo.findOne({
      where: { tableId: 'A01', sessionVersion: t.sessionVersion },
      order: { id: 'DESC' }
    })
    if (!cart) {
      cart = cartRepo.create({
        cartId: 'cart_test',
        storeId: 'store_default',
        tableId: 'A01',
        sessionVersion: t.sessionVersion,
        version: 1,
        openedAt: new Date()
      })
      await cartRepo.save(cart)
      cart = await cartRepo.findOne({
        where: { tableId: 'A01', sessionVersion: t.sessionVersion },
        order: { id: 'DESC' }
      })
    }
    assert.ok(cart)
    await cartItemRepo.delete({ cartId: cart.cartId })
    const item = cartItemRepo.create({
      cartItemId: `ci_test_${suffix}`,
      cartId: cart.cartId,
      skuId: s.skuId,
      goodId: g.goodId,
      goodNameSnapshot: g.name,
      specTextSnapshot: s.specCombination,
      unitPriceSnapshot: s.price,
      qty: 2,
      addedByUserId: 'usr_1',
      addedByNicknameSnapshot: '',
      addedByAvatarSnapshot: ''
    })
    await cartItemRepo.save(item)

    const orderResp = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearerAuthz(adminToken),
        'X-Request-Id': makeRequestId('t')
      },
      body: JSON.stringify({ tableId: 'A01', cartVersion: cart.version })
    })
    assert.equal(orderResp.status, 201)
    const orderJson = await orderResp.json()
    assert.equal(orderJson.data.status, 'Paid')
  })
})
