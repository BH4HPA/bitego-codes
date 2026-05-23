const test = require('node:test')
const assert = require('node:assert/strict')

test('admin conn-count broadcaster batches updates within maxDelayMs', async () => {
  const { createConnCountBroadcaster } = require('../dist/ws/adminDashboard')

  const sent = []
  const b = createConnCountBroadcaster({
    maxDelayMs: 50,
    sendToAll: (p) => sent.push(p)
  })

  b.onChange({ tableId: 't1', connCount: 1 })
  b.onChange({ tableId: 't1', connCount: 2 })
  b.onChange({ tableId: 't2', connCount: 5 })

  await new Promise((r) => setTimeout(r, 70))

  assert.equal(sent.length, 1)
  assert.equal(sent[0].type, 'TABLE_CONN_COUNTS')
  assert.deepEqual(sent[0].data, { t1: 2, t2: 5 })
})
