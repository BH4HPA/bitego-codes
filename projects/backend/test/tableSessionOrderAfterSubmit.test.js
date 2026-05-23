const test = require('node:test')
const assert = require('node:assert/strict')
const { WebSocket } = require('ws')
const {
  withServer,
  getDevToken,
  terminateWs,
  makeRequestId,
  waitForWsMessage,
  connectTableSessionWs,
  storeAdminAuthz,
  bearerAuthz
} = require('./testUtils')

async function me(base, token) {
  const resp = await fetch(`${base}/api/v1/users/me`, { headers: bearerAuthz(token) })
  assert.equal(resp.status, 200)
  return (await resp.json()).data
}

test('order submit broadcasts cart cleared and allows table-session users to view orders', async () => {
  const sockets = []
  await withServer(
    async (ctx) => {
      const { setStoreMaintenanceState, setTenantMaintenanceState } = require('../dist/services/maintenance')
      await setStoreMaintenanceState('store_default', false)
      await setTenantMaintenanceState('store_default', false)
      const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const admin = await getDevToken(ctx.base, 'ADMIN')
      const userIdA = `usrA_${suffix}`
      const userIdB = `usrB_${suffix}`
      const tokenA0 = await getDevToken(ctx.base, 'CUSTOMER', userIdA)
      const tokenB0 = await getDevToken(ctx.base, 'CUSTOMER', userIdB)
      const authz = storeAdminAuthz(admin)

      const meA = await me(ctx.base, tokenA0)
      const meB = await me(ctx.base, tokenB0)
      assert.ok(meA.userId)
      assert.ok(meB.userId)

      const tableCreate = await fetch(`${ctx.base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ code: `T_${suffix}` })
      })
      assert.equal(tableCreate.status, 201)
      const tableId = (await tableCreate.json()).data.tableId

      const tableInfo = await fetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`)
      assert.equal(tableInfo.status, 200)
      const tableInfoJson = await tableInfo.json()
      const sessionToken = tableInfoJson.data.sessionToken
      const sessionVersion = tableInfoJson.data.sessionVersion
      assert.ok(sessionToken)
      assert.ok(sessionVersion)

      const goodId = `good_${suffix}`
      const goodRepo = ctx.AppDataSource.getRepository(require('../dist/entities/Good').Good)
      await goodRepo.save(
        goodRepo.create({
          goodId,
          storeId: 'store_default',
          categoryId: 'cat_test',
          name: `G_${suffix}`,
          description: '',
          sales: 0,
          status: 'ON_SHELF'
        })
      )
      const skuCreate = await fetch(`${ctx.base}/api/v1/skus`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ goodId, specCombination: '默认', priceCents: 1000, stock: 99, status: 'ON_SHELF' })
      })
      assert.equal(skuCreate.status, 201)
      const skuId = (await skuCreate.json()).data.skuId

      const { TableCart } = require('../dist/entities/TableCart')
      const { TableCartItem } = require('../dist/entities/TableCartItem')
      const cartRepo = ctx.AppDataSource.getRepository(TableCart)
      const itemRepo = ctx.AppDataSource.getRepository(TableCartItem)
      const cartId = `cart_${suffix}`
      await cartRepo.save(
        cartRepo.create({ cartId, storeId: 'store_default', tableId, sessionVersion, version: 1, openedAt: new Date() })
      )
      await itemRepo.save(
        itemRepo.create({
          cartItemId: `ci_${suffix}`,
          cartId,
          skuId,
          goodId,
          goodNameSnapshot: `G_${suffix}`,
          specTextSnapshot: '默认',
          unitPriceSnapshot: '1000',
          qty: 1,
          addedByUserId: meA.userId,
          addedByNicknameSnapshot: meA.nickname || '用户',
          addedByAvatarSnapshot: meA.avatarUrl || ''
        })
      )

      const {
        ws: wsA,
        snapshot: snapA,
        token: tokenA
      } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'CUSTOMER', userId: userIdA, tableId, sessionToken },
        { retries: 3, timeoutMs: 12000 }
      )
      const {
        ws: wsB,
        snapshot: snapB,
        token: tokenB
      } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'CUSTOMER', userId: userIdB, tableId, sessionToken },
        { retries: 3, timeoutMs: 12000 }
      )
      sockets.push(wsA, wsB)
      assert.equal(snapA.type, 'CART_SNAPSHOT')
      assert.equal(snapB.type, 'CART_SNAPSHOT')
      assert.equal(snapA.version, snapB.version)
      assert.equal(snapA.version, 1)
      assert.equal(snapA.data.items.length, 1)

      const clearedAP = waitForWsMessage(wsA, (m) => m.type === 'CART_UPDATED' && m.version === 2, 4000)
      const clearedBP = waitForWsMessage(wsB, (m) => m.type === 'CART_UPDATED' && m.version === 2, 4000)

      const orderCreate = await fetch(`${ctx.base}/api/v1/orders`, {
        method: 'POST',
        headers: {
          ...bearerAuthz(tokenA),
          'content-type': 'application/json',
          'x-request-id': makeRequestId(`req_${suffix}`)
        },
        body: JSON.stringify({ tableId, cartVersion: 1, paymentMethod: 'WECHAT', remark: '' })
      })
      assert.equal(orderCreate.status, 201)
      const orderId = (await orderCreate.json()).data.orderId
      assert.ok(orderId)

      const clearedA = await clearedAP
      const clearedB = await clearedBP
      assert.equal(Array.isArray(clearedA.data.items), true)
      assert.equal(Array.isArray(clearedB.data.items), true)
      assert.equal(clearedA.data.items.length, 0)
      assert.equal(clearedB.data.items.length, 0)

      const listB = await fetch(
        `${ctx.base}/api/v1/orders?tableId=${encodeURIComponent(tableId)}&tableSessionVersion=${encodeURIComponent(String(sessionVersion))}&sessionToken=${encodeURIComponent(
          sessionToken
        )}&page=1&pageSize=50`,
        { headers: bearerAuthz(tokenB) }
      )
      assert.equal(listB.status, 200)
      const listBJson = await listB.json()
      assert.ok(listBJson.data.list.some((x) => x.orderId === orderId))

      const detailB = await fetch(
        `${ctx.base}/api/v1/orders/${encodeURIComponent(orderId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
        {
          headers: bearerAuthz(tokenB)
        }
      )
      assert.equal(detailB.status, 200)
      const detailBJson = await detailB.json()
      assert.equal(detailBJson.data.orderId, orderId)
      assert.equal(detailBJson.data.payerUserId, meA.userId)
      assert.ok(detailBJson.data.payerNickname)
    },
    null,
    async () => {
      for (const ws of sockets) terminateWs(ws)
    },
    { withTableSessionWs: true, withAdminDashboardWs: true }
  )
})
