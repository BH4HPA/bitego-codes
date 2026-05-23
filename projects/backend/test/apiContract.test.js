const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, makeRequestId, bearerAuthz } = require('./testUtils')

test('api contract smoke (admin)', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base, AppDataSource }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const storeGet = await fetch(`${base}/api/v1/stores/current`, { headers: authz })
    assert.equal(storeGet.status, 200)

    const storePut = await fetch(`${base}/api/v1/stores/current`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `S_${suffix}`, phone: '18812345678' })
    })
    assert.equal(storePut.status, 200)

    const catCreate = await fetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `C_${suffix}`, sort: 1, status: 'ACTIVE' })
    })
    assert.equal(catCreate.status, 201)
    const categoryId = (await catCreate.json()).data.categoryId
    assert.ok(categoryId)

    const catList = await fetch(`${base}/api/v1/categories?status=ACTIVE&page=1&pageSize=20`)
    assert.equal(catList.status, 200)

    const catUpdate = await fetch(`${base}/api/v1/categories/${categoryId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ sort: 2 })
    })
    assert.equal(catUpdate.status, 200)

    const catDel = await fetch(`${base}/api/v1/categories/${categoryId}`, { method: 'DELETE', headers: authz })
    assert.equal(catDel.status, 200)

    const goodCreate = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId,
        name: `G_${suffix}`,
        description: 'd',
        imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
        status: 'ON_SHELF'
      })
    })
    assert.equal(goodCreate.status, 201)
    const goodId = (await goodCreate.json()).data.goodId
    assert.ok(goodId)

    const skuCreate = await fetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, specCombination: '默认', priceCents: 1000, stock: 50, status: 'ON_SHELF' })
    })
    assert.equal(skuCreate.status, 201)
    const skuId = (await skuCreate.json()).data.skuId
    assert.ok(skuId)

    const goodsList = await fetch(`${base}/api/v1/goods?status=ON_SHELF&categoryId=${categoryId}&page=1&pageSize=20`)
    assert.equal(goodsList.status, 200)

    const goodDetail = await fetch(`${base}/api/v1/goods/${goodId}`)
    assert.equal(goodDetail.status, 200)
    const goodDetailJson = await goodDetail.json()
    assert.equal(goodDetailJson.data.goodId, goodId)
    assert.equal(goodDetailJson.data.status, 'ON_SHELF')
    assert.equal(Array.isArray(goodDetailJson.data.imageUrls), true)
    assert.equal(goodDetailJson.data.imageUrls.length, 2)
    assert.equal(goodDetailJson.data.imageUrls[0], 'https://example.com/a.png')

    const skuList = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList.status, 200)

    const skuUpdate = await fetch(`${base}/api/v1/skus/${skuId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ stock: 49 })
    })
    assert.equal(skuUpdate.status, 200)

    const tableCode = `T_${suffix}`
    const tableCreate = await fetch(`${base}/api/v1/tables`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ code: tableCode })
    })
    assert.equal(tableCreate.status, 201)
    const tableId = (await tableCreate.json()).data.tableId
    assert.ok(tableId)

    const tableList = await fetch(`${base}/api/v1/tables?page=1&pageSize=20`, { headers: authz })
    assert.equal(tableList.status, 200)

    const tableUpdate = await fetch(`${base}/api/v1/tables/${tableId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'OCCUPIED' })
    })
    assert.equal(tableUpdate.status, 200)

    const tableInfo = await fetch(`${base}/api/v1/tables/${tableId}`)
    assert.equal(tableInfo.status, 200)
    const tableInfoJson = await tableInfo.json()
    assert.ok(tableInfoJson.data.sessionToken)

    const { TableCart } = require('../dist/entities/TableCart')
    const { TableCartItem } = require('../dist/entities/TableCartItem')
    const { Table } = require('../dist/entities/Table')
    const { OrderItem } = require('../dist/entities/OrderItem')

    const tableRepo = AppDataSource.getRepository(Table)
    const cartRepo = AppDataSource.getRepository(TableCart)
    const cartItemRepo = AppDataSource.getRepository(TableCartItem)
    const orderItemRepo = AppDataSource.getRepository(OrderItem)

    const t = await tableRepo.findOne({ where: { tableId } })
    assert.ok(t)

    const cartId = `cart_${suffix}`
    const cart = cartRepo.create({
      cartId,
      storeId: 'store_default',
      tableId,
      sessionVersion: t.sessionVersion,
      version: 1,
      openedAt: new Date()
    })
    await cartRepo.save(cart)

    const cartItemId = `ci_${suffix}`
    const cartItem = cartItemRepo.create({
      cartItemId,
      cartId,
      skuId,
      goodId,
      goodNameSnapshot: `G_${suffix}`,
      specTextSnapshot: '默认',
      unitPriceSnapshot: '1000',
      qty: 1,
      addedByUserId: 'usr_1',
      addedByNicknameSnapshot: '',
      addedByAvatarSnapshot: ''
    })
    await cartItemRepo.save(cartItem)

    const orderCreate = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'X-Request-Id': makeRequestId(`o_${suffix}`) },
      body: JSON.stringify({ tableId, cartVersion: 1, remark: '不要香菜' })
    })
    assert.equal(orderCreate.status, 201)
    const orderId = (await orderCreate.json()).data.orderId

    const refundReq = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'X-Request-Id': makeRequestId(`r_${suffix}`) },
      body: JSON.stringify({ reason: 'test' })
    })
    assert.equal(refundReq.status, 202)

    const orderList = await fetch(`${base}/api/v1/orders?status=Paid&page=1&pageSize=20`, { headers: authz })
    assert.equal(orderList.status, 200)

    const orderDetail = await fetch(`${base}/api/v1/orders/${orderId}`, { headers: authz })
    assert.equal(orderDetail.status, 200)

    const orderNo = (await orderDetail.json()).data.orderNo
    assert.ok(orderNo)
    const orderListByNo = await fetch(
      `${base}/api/v1/orders?orderNo=${encodeURIComponent(orderNo)}&page=1&pageSize=20`,
      { headers: authz }
    )
    assert.equal(orderListByNo.status, 200)
    const orderListByNoJson = await orderListByNo.json()
    assert.ok(orderListByNoJson.data.list.some((x) => x.orderId === orderId))

    const orderItemRow = await orderItemRepo.findOne({ where: { orderId } })
    assert.ok(orderItemRow)

    const serve = await fetch(`${base}/api/v1/orders/${orderId}/items/${orderItemRow.orderItemId}/serve`, {
      method: 'POST',
      headers: authz
    })
    assert.equal(serve.status, 200)

    const statusUpdate = await fetch(`${base}/api/v1/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Making' })
    })
    assert.equal(statusUpdate.status, 200)

    const refundOrderCreate = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'X-Request-Id': `o2_${suffix}` },
      body: JSON.stringify({ tableId, cartVersion: 2 })
    })
    assert.equal(refundOrderCreate.status, 400)

    const dash = await fetch(`${base}/api/v1/dashboard/overview`, { headers: authz })
    assert.equal(dash.status, 200)
    const dashJson = await dash.json()
    const active = (dashJson.data.activeOrders || []).find((x) => x.orderId === orderId)
    assert.ok(active)
    assert.equal(active.remark, '不要香菜')
    const tableRow = (dashJson.data.tables || []).find((x) => x.tableId === tableId)
    assert.ok(tableRow)
    assert.ok(typeof tableRow.totalOrderCount === 'number')
    assert.ok(String(tableRow.totalAmountExRefunded || '').length >= 1)

    const forceClear = await fetch(`${base}/api/v1/tables/${tableId}/force-clear`, { method: 'POST', headers: authz })
    assert.equal(forceClear.status, 200)

    const dash2 = await fetch(`${base}/api/v1/dashboard/overview`, { headers: authz })
    assert.equal(dash2.status, 200)

    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(login.status, 200)
    const loginToken = (await login.json()).data.token
    assert.ok(loginToken)
    const me = await fetch(`${base}/api/v1/users/me`, { headers: bearerAuthz(loginToken) })
    assert.equal(me.status, 200)
  })
})
