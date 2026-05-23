const test = require('node:test')
const assert = require('node:assert/strict')
const { WebSocket } = require('ws')
const {
  withServer,
  getDevToken,
  terminateWs,
  waitForWsMessage,
  connectTableSessionWs,
  storeAdminAuthz
} = require('./testUtils')

test('CART_UPDATED carries the actor that performed the op (ADD and REMOVE)', async () => {
  const sockets = []
  await withServer(
    async (ctx) => {
      const adminToken = await getDevToken(ctx.base, 'ADMIN')
      const authz = storeAdminAuthz(adminToken)

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

      const goodId = `good_actor_${Date.now()}`
      const goodRepo = ctx.AppDataSource.getRepository(require('../dist/entities/Good').Good)
      await goodRepo.save(
        goodRepo.create({
          goodId,
          storeId: 'store_default',
          categoryId: 'cat_test',
          name: 'GActor',
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
      assert.ok(skuId)

      const userIdA = `usrA_${Date.now()}`
      const userIdB = `usrB_${Date.now()}`
      const { ws: wsA, snapshot: snapA } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: userIdA, tableId, sessionToken },
        { retries: 3, timeoutMs: 15000 }
      )
      const { ws: wsB } = await connectTableSessionWs(
        ctx.base,
        WebSocket,
        { role: 'USER', userId: userIdB, tableId, sessionToken },
        { retries: 3, timeoutMs: 15000 }
      )
      sockets.push(wsA, wsB)

      const baseVersion = snapA.version
      const isCartMsg = (m) => m && (m.type === 'CART_UPDATED' || m.type === 'ERROR')

      const addAck = Promise.all([waitForWsMessage(wsA, isCartMsg, 15000), waitForWsMessage(wsB, isCartMsg, 15000)])
      wsA.send(
        JSON.stringify({
          opId: `opAdd_${Date.now()}`,
          opType: 'ADD_ITEM',
          baseVersion,
          payload: { skuId, qty: 2 }
        })
      )
      const [, addOnB] = await addAck
      assert.equal(addOnB.type, 'CART_UPDATED')
      assert.ok(addOnB.actor, 'ADD CART_UPDATED should include actor')
      assert.equal(addOnB.actor.userId, userIdA)
      assert.equal(addOnB.data.items.length, 1)
      const cartItemId = addOnB.data.items[0].cartItemId
      assert.ok(cartItemId)

      const removeAck = Promise.all([waitForWsMessage(wsA, isCartMsg, 15000), waitForWsMessage(wsB, isCartMsg, 15000)])
      wsA.send(
        JSON.stringify({
          opId: `opRem_${Date.now()}`,
          opType: 'REMOVE_ITEM',
          baseVersion: addOnB.version,
          payload: { cartItemId }
        })
      )
      const [, removeOnB] = await removeAck
      assert.equal(removeOnB.type, 'CART_UPDATED')
      assert.ok(removeOnB.actor, 'REMOVE CART_UPDATED should include actor for client-side toast')
      assert.equal(removeOnB.actor.userId, userIdA)
      assert.equal(removeOnB.data.items.length, 0)
    },
    null,
    async () => {
      for (const ws of sockets) terminateWs(ws)
    },
    { withTableSessionWs: true }
  )
})
