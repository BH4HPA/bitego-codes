const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, makeRequestId } = require('./testUtils')

test('orders list/detail provide xxxCents fields', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`

    const tableCreate = await fetch(`${base}/api/v1/tables`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ code: `T_${suffix}` })
    })
    assert.equal(tableCreate.status, 201)
    const tableId = (await tableCreate.json()).data.tableId

    const goodCreate = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${suffix}`, status: 'ON_SHELF' })
    })
    assert.equal(goodCreate.status, 201)
    const goodId = (await goodCreate.json()).data.goodId

    const skuCreate = await fetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, specCombination: '默认', priceCents: 1234, stock: 10, status: 'ON_SHELF' })
    })
    assert.equal(skuCreate.status, 201)
    const skuId = (await skuCreate.json()).data.skuId

    const cartRepo = AppDataSource.getRepository(require('../dist/entities/TableCart').TableCart)
    const cartItemRepo = AppDataSource.getRepository(require('../dist/entities/TableCartItem').TableCartItem)
    const cartId = `cart_${suffix}`
    const cartItemId = `cartitem_${suffix}`
    await cartRepo.save(
      cartRepo.create({
        cartId,
        storeId: 'store_default',
        tableId,
        sessionVersion: 1,
        version: 1,
        openedAt: new Date()
      })
    )
    await cartItemRepo.save(
      cartItemRepo.create({
        cartItemId,
        cartId,
        skuId,
        goodId,
        goodNameSnapshot: `G_${suffix}`,
        specTextSnapshot: '默认',
        unitPriceSnapshot: '1234',
        qty: 2,
        addedByUserId: 'usr_1',
        addedByNicknameSnapshot: '',
        addedByAvatarSnapshot: ''
      })
    )

    const orderCreate = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-request-id': makeRequestId(`k_${suffix}`) },
      body: JSON.stringify({ tableId, cartVersion: 1, paymentMethod: 'WECHAT', remark: '' })
    })
    assert.equal(orderCreate.status, 201)
    const orderId = (await orderCreate.json()).data.orderId

    const goodAfterPaid = await fetch(`${base}/api/v1/goods/${goodId}`, { headers: authz })
    assert.equal(goodAfterPaid.status, 200)
    const goodAfterPaidJson = await goodAfterPaid.json()
    assert.equal(goodAfterPaidJson.data.sales, 2)

    const list = await fetch(`${base}/api/v1/orders?status=Paid&page=1&pageSize=20`, { headers: authz })
    assert.equal(list.status, 200)
    const listJson = await list.json()
    assert.equal(typeof listJson.data.list[0].totalAmountCents, 'number')
    assert.equal(listJson.data.list[0].tableCode, `T_${suffix}`)
    assert.ok(listJson.data.list[0].createdAt)

    const detail = await fetch(`${base}/api/v1/orders/${orderId}`, { headers: authz })
    assert.equal(detail.status, 200)
    const detailJson = await detail.json()
    assert.equal(detailJson.data.totalAmountCents, 2468)
    assert.equal(detailJson.data.items[0].unitPriceSnapshotCents, 1234)
    assert.equal(detailJson.data.tableCode, `T_${suffix}`)
    assert.ok(detailJson.data.createdAt)

    const cancel = await fetch(`${base}/api/v1/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Canceled', reason: 'test' })
    })
    assert.equal(cancel.status, 200)

    const goodAfterCancel = await fetch(`${base}/api/v1/goods/${goodId}`, { headers: authz })
    assert.equal(goodAfterCancel.status, 200)
    const goodAfterCancelJson = await goodAfterCancel.json()
    assert.equal(goodAfterCancelJson.data.sales, 0)
  })
})
