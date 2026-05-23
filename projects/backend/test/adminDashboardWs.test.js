const test = require('node:test')
const assert = require('node:assert/strict')
const WebSocket = require('ws')
const { withServer, getDevToken, terminateWs, waitForWsMessage, waitForWsOpen } = require('./testUtils')

test('admin dashboard websocket accepts admin token and sends snapshot', async () => {
  let ws = null
  await withServer(
    async (ctx) => {
      for (let i = 0; i < 2; i++) {
        const token = await getDevToken(ctx.base, 'ADMIN')
        assert.ok(typeof token === 'string' && token.length > 10)

        ws = new WebSocket(
          `${ctx.base.replace('http://', 'ws://')}/ws/admin-dashboard?token=${encodeURIComponent(token)}`
        )
        await waitForWsOpen(ws)
        const msg = await waitForWsMessage(
          ws,
          (m) => m && (m.type === 'TABLE_CONN_COUNTS_SNAPSHOT' || m.type === 'ERROR'),
          12000
        )
        if (msg.type === 'TABLE_CONN_COUNTS_SNAPSHOT') {
          assert.ok(msg.data && typeof msg.data === 'object')
          return
        }
        terminateWs(ws)
        ws = null
        if (msg.data && msg.data.code === 40100 && i === 0) continue
        assert.fail(`unexpected ERROR: ${JSON.stringify(msg)}`)
      }
    },
    null,
    async () => {
      terminateWs(ws)
    },
    { withAdminDashboardWs: true }
  )
})
