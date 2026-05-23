const test = require('node:test')
const assert = require('node:assert/strict')
const { WebSocket } = require('ws')
const {
  withServer,
  getAuthz,
  terminateWs,
  makeRequestId,
  waitForWsMessage,
  connectTableSessionWs,
  bearerAuthz
} = require('./testUtils')

test('non-stock option affects unit price and spec snapshot, but not SKU set', async () => {
  let ws = null
  await withServer(
    async (ctx) => {
      const userId = `usr_${Date.now()}`
      const authz = await getAuthz(ctx.base, 'ADMIN')

      const createCat = await fetch(`${ctx.base}/api/v1/categories`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `分类_${Date.now()}`, sort: 100, status: 'ACTIVE' })
      })
      assert.equal(createCat.status, 201)
      const categoryId = (await createCat.json()).data.categoryId

      const createGood = await fetch(`${ctx.base}/api/v1/goods`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          name: `奶茶_${Date.now()}`,
          status: 'OFF_SHELF',
          basePriceCents: 500,
          optionGroups: [
            {
              name: '杯型',
              isStock: true,
              isRequired: true,
              minSelection: 1,
              maxSelection: 1,
              options: [
                { name: '中杯', priceCents: 0 },
                { name: '大杯', priceCents: 0 }
              ]
            },
            {
              name: '甜度',
              isStock: false,
              isRequired: false,
              minSelection: 0,
              maxSelection: 1,
              options: [
                { name: '正常', priceCents: 0 },
                { name: '加糖', priceCents: 100 }
              ]
            }
          ]
        })
      })
      assert.equal(createGood.status, 201)
      const goodId = (await createGood.json()).data.goodId

      const getGoodResp = await fetch(`${ctx.base}/api/v1/goods/${encodeURIComponent(goodId)}`, { headers: authz })
      assert.equal(getGoodResp.status, 200)
      const good = (await getGoodResp.json()).data
      assert.equal(good.optionGroups.length, 2)
      assert.equal(good.skus.length, 2)

      const skuId = good.skus[0].skuId
      const nonStockGroup = good.optionGroups.find((g) => g.name === '甜度')
      assert.ok(nonStockGroup)
      const addSugar = nonStockGroup.options.find((o) => o.name === '加糖')
      assert.ok(addSugar)

      const bulk = await fetch(`${ctx.base}/api/v1/skus/bulk`, {
        method: 'PUT',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ skuIds: [skuId], stock: 10, status: 'ON_SHELF' })
      })
      assert.equal(bulk.status, 200)

      const createTable = await fetch(`${ctx.base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ code: `T_${Date.now()}` })
      })
      assert.equal(createTable.status, 201)
      const tableId = (await createTable.json()).data.tableId

      const tableResp = await fetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(tableResp.status, 200)
      const sessionToken = (await tableResp.json()).data.sessionToken
      assert.ok(sessionToken)

      const r = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'CUSTOMER', userId, tableId, sessionToken },
        { retries: 3, timeoutMs: 12000 }
      )
      ws = r.ws
      const userToken = r.token
      const snap = r.snapshot
      const v1 = snap.version

      ws.send(
        JSON.stringify({
          opId: `op_${Date.now()}`,
          opType: 'ADD_ITEM',
          baseVersion: v1,
          payload: { skuId, qty: 1, nonStockSelectionsByGroupId: { [nonStockGroup.id]: [addSugar.id] } }
        })
      )
      const upd = await waitForWsMessage(ws, (m) => m.type === 'CART_UPDATED' || m.type === 'ERROR')
      assert.equal(upd.type, 'CART_UPDATED')
      const items = upd.data.items || []
      assert.equal(items.length, 1)
      assert.equal(items[0].skuId, skuId)
      assert.ok(String(items[0].specTextSnapshot).includes('甜度:加糖'))
      assert.equal(String(items[0].unitPriceSnapshot), '600')

      const orderResp = await fetch(`${ctx.base}/api/v1/orders`, {
        method: 'POST',
        headers: {
          ...bearerAuthz(userToken),
          'content-type': 'application/json',
          'X-Request-Id': makeRequestId('req')
        },
        body: JSON.stringify({ tableId, cartVersion: upd.version, paymentMethod: 'WECHAT' })
      })
      assert.equal(orderResp.status, 201)
      const orderId = (await orderResp.json()).data.orderId

      const orderItemRepo = ctx.AppDataSource.getRepository(require('../dist/entities/OrderItem').OrderItem)
      const rows = await orderItemRepo.find({ where: { orderId } })
      assert.equal(rows.length, 1)
      assert.ok(String(rows[0].specTextSnapshot).includes('甜度:加糖'))
      assert.equal(String(rows[0].unitPriceSnapshot), '600')
    },
    null,
    async () => {
      terminateWs(ws)
    },
    { withTableSessionWs: true, withAdminDashboardWs: true }
  )
})
