const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, makeRequestId } = require('./testUtils')

test('refund request -> review reject/approve and keeps reject history', async () => {
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
      body: JSON.stringify({ goodId, specCombination: '默认', priceCents: 1000, stock: 10, status: 'ON_SHELF' })
    })
    assert.equal(skuCreate.status, 201)
    const skuId = (await skuCreate.json()).data.skuId

    const cartRepo = AppDataSource.getRepository(require('../dist/entities/TableCart').TableCart)
    const cartItemRepo = AppDataSource.getRepository(require('../dist/entities/TableCartItem').TableCartItem)
    const cartId = `cart_${suffix}`
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
        cartItemId: `ci_${suffix}`,
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
    )

    const orderCreate = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-request-id': makeRequestId(`o_${suffix}`) },
      body: JSON.stringify({ tableId, cartVersion: 1, paymentMethod: 'WECHAT', remark: '' })
    })
    assert.equal(orderCreate.status, 201)
    const orderId = (await orderCreate.json()).data.orderId

    const refundReq1 = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-request-id': makeRequestId(`r1_${suffix}`) },
      body: JSON.stringify({ reason: 'bad taste' })
    })
    assert.equal(refundReq1.status, 202)
    const refund1 = (await refundReq1.json()).data
    assert.equal(refund1.status, 'REVIEWING')

    const refunds1 = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, { headers: authz })
    assert.equal(refunds1.status, 200)
    const refunds1Json = await refunds1.json()
    assert.equal(refunds1Json.data.list.length, 1)
    assert.equal(refunds1Json.data.list[0].refundId, refund1.refundId)

    const reject = await fetch(`${base}/api/v1/orders/${orderId}/refunds/${refund1.refundId}/review`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'REJECT', reason: '不符合退款规则' })
    })
    assert.equal(reject.status, 200)

    const orderAfterReject = await fetch(`${base}/api/v1/orders/${orderId}`, { headers: authz })
    assert.equal(orderAfterReject.status, 200)
    const orderAfterRejectJson = await orderAfterReject.json()
    assert.equal(orderAfterRejectJson.data.status, 'Paid')

    const refundsAfterReject = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, { headers: authz })
    assert.equal(refundsAfterReject.status, 200)
    const refundsAfterRejectJson = await refundsAfterReject.json()
    assert.equal(refundsAfterRejectJson.data.list[0].status, 'REJECTED')
    assert.equal(refundsAfterRejectJson.data.list[0].reviewRejectReason, '不符合退款规则')

    const refundReq2 = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-request-id': makeRequestId(`r2_${suffix}`) },
      body: JSON.stringify({ reason: 'mistake' })
    })
    assert.equal(refundReq2.status, 202)
    const refund2 = (await refundReq2.json()).data
    assert.equal(refund2.status, 'REVIEWING')
    assert.notEqual(refund2.refundId, refund1.refundId)

    const approve = await fetch(`${base}/api/v1/orders/${orderId}/refunds/${refund2.refundId}/review`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'APPROVE' })
    })
    assert.equal(approve.status, 200)

    const refundsAfterApprove = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, { headers: authz })
    assert.equal(refundsAfterApprove.status, 200)
    const refundsAfterApproveJson = await refundsAfterApprove.json()
    assert.equal(refundsAfterApproveJson.data.list.length, 2)
    assert.equal(refundsAfterApproveJson.data.list[0].status, 'PENDING')

    const skuRepo = AppDataSource.getRepository(require('../dist/entities/SKU').SKU)
    const stockBefore = (await skuRepo.findOne({ where: { skuId } })).stock
    await require('../dist/workers/refundWorker').runRefundWorkerOnce({ etaMs: 0, nowMs: Date.now() + 100000 })
    const stockAfter = (await skuRepo.findOne({ where: { skuId } })).stock
    assert.equal(stockAfter, stockBefore + 1)
  })
})

test('customer refund: only the order submitter (order.userId) may apply or list', async () => {
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
      body: JSON.stringify({ goodId, specCombination: '默认', priceCents: 1000, stock: 10, status: 'ON_SHELF' })
    })
    assert.equal(skuCreate.status, 201)
    const skuId = (await skuCreate.json()).data.skuId

    const cartRepo = AppDataSource.getRepository(require('../dist/entities/TableCart').TableCart)
    const cartItemRepo = AppDataSource.getRepository(require('../dist/entities/TableCartItem').TableCartItem)
    const cartId = `cart_${suffix}`
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
        cartItemId: `ci_${suffix}`,
        cartId,
        skuId,
        goodId,
        goodNameSnapshot: `G_${suffix}`,
        specTextSnapshot: '默认',
        unitPriceSnapshot: '1000',
        qty: 1,
        addedByUserId: 'usr_b',
        addedByNicknameSnapshot: '',
        addedByAvatarSnapshot: ''
      })
    )

    const orderCreate = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json', 'x-request-id': makeRequestId(`o_${suffix}`) },
      body: JSON.stringify({ tableId, cartVersion: 1, paymentMethod: 'WECHAT', remark: '' })
    })
    assert.equal(orderCreate.status, 201)
    const orderId = (await orderCreate.json()).data.orderId

    // Simulate the real shared-cart scenario: A submitted, so the order.userId is A.
    const orderRepo = AppDataSource.getRepository(require('../dist/entities/Order').Order)
    await orderRepo.update({ orderId }, { userId: 'usr_a' })

    const userAAuthz = await getAuthz(base, 'CUSTOMER', 'usr_a')
    const userBAuthz = await getAuthz(base, 'CUSTOMER', 'usr_b')

    // B (cart contributor but not submitter) is forbidden from applying.
    const refundAsB = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { ...userBAuthz, 'content-type': 'application/json', 'x-request-id': makeRequestId(`rb_${suffix}`) },
      body: JSON.stringify({ reason: 'B tries' })
    })
    assert.equal(refundAsB.status, 403)

    // A (the submitter) succeeds.
    const refundAsA = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { ...userAAuthz, 'content-type': 'application/json', 'x-request-id': makeRequestId(`ra_${suffix}`) },
      body: JSON.stringify({ reason: 'A applies' })
    })
    assert.equal(refundAsA.status, 202)
    const refundId = (await refundAsA.json()).data.refundId
    assert.ok(refundId)

    // GET list mirrors the same authorization rule.
    const listAsA = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, { headers: userAAuthz })
    assert.equal(listAsA.status, 200)
    assert.equal((await listAsA.json()).data.list[0].refundId, refundId)

    const listAsB = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, { headers: userBAuthz })
    assert.equal(listAsB.status, 403)
  })
})
