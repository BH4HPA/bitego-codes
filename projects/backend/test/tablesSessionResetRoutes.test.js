const test = require('node:test')
const assert = require('node:assert/strict')
const { WebSocket } = require('ws')
const {
  withServer,
  getDevToken,
  jsonFetch,
  connectTableSessionWs,
  terminateWs,
  storeAdminAuthz,
  customerAuthz
} = require('./testUtils')

test('tables routes: get table occupancy hints and reset-session guards', async () => {
  let ws = null
  await withServer(
    async (ctx) => {
      const adminToken = await getDevToken(ctx.base, 'ADMIN')
      const adminAuthz = storeAdminAuthz(adminToken)

      const createTable = await jsonFetch(`${ctx.base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ code: `T_${Date.now()}` })
      })
      assert.equal(createTable.resp.status, 201)
      const tableId = createTable.json.data.tableId
      assert.ok(tableId)

      const get1 = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(get1.resp.status, 200)
      assert.ok(get1.json.data.sessionToken)
      assert.equal(get1.json.data.wasFree, true)
      assert.equal(get1.json.data.connCount, 0)
      assert.equal(get1.json.data.activeOrderCount, 0)

      const sessionToken = get1.json.data.sessionToken
      const { ws: ws1 } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'CUSTOMER', userId: `usr_${Date.now()}`, tableId, sessionToken },
        { retries: 3, timeoutMs: 15000 }
      )
      ws = ws1

      const get2 = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(get2.resp.status, 200)
      assert.equal(get2.json.data.wasFree, false)
      assert.ok(Number(get2.json.data.connCount) >= 1)
      assert.equal(get2.json.data.activeOrderCount, 0)

      const Order = require('../dist/entities/Order').Order
      const orderRepo = ctx.AppDataSource.getRepository(Order)
      const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
      await orderRepo.save(
        orderRepo.create({
          orderId: `ord_${suffix}`,
          orderNo: `NO_${suffix}`,
          storeId: 'store_default',
          tableId,
          tableSessionVersion: get2.json.data.sessionVersion,
          userId: `u_${suffix}`,
          status: 'Paid',
          totalAmount: '0',
          paidAmount: '0',
          paidAt: new Date()
        })
      )

      const get3 = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(get3.resp.status, 200)
      assert.ok(Number(get3.json.data.activeOrderCount) >= 1)

      const noAuthReset = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}/reset-session`, {
        method: 'POST'
      })
      assert.equal(noAuthReset.resp.status, 401)

      const customerToken = await getDevToken(ctx.base, 'CUSTOMER', `usr_reset_${suffix}`)
      const customerAuthzHeaders = customerAuthz(customerToken)

      const resetWithConn = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}/reset-session`, {
        method: 'POST',
        headers: customerAuthzHeaders
      })
      assert.equal(resetWithConn.resp.status, 409)

      terminateWs(ws)
      ws = null
      await new Promise((r) => setTimeout(r, 200))

      const resetWithActiveOrders = await jsonFetch(
        `${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}/reset-session`,
        {
          method: 'POST',
          headers: customerAuthzHeaders
        }
      )
      assert.equal(resetWithActiveOrders.resp.status, 409)

      await orderRepo.update({ orderId: `ord_${suffix}` }, { status: 'Completed', completedAt: new Date() })

      const okReset = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}/reset-session`, {
        method: 'POST',
        headers: customerAuthzHeaders
      })
      assert.equal(okReset.resp.status, 200)
      assert.equal(okReset.json.data.status, 'FREE')
      assert.ok(Number(okReset.json.data.sessionVersion) > Number(get3.json.data.sessionVersion))

      const afterReset = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(afterReset.resp.status, 200)
      assert.equal(afterReset.json.data.wasFree, true)
      assert.ok(afterReset.json.data.sessionToken)
    },
    null,
    async () => {
      terminateWs(ws)
    },
    { withTableSessionWs: true }
  )
})
