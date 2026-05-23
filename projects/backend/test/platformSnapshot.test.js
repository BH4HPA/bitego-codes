const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, bearerAuthz, platformAdminAuthz } = require('./testUtils')

test('platform snapshot import reports dropped columns, unknown tables, missing tables', async () => {
  let originalPut = null
  let captured = null
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const exp = await jsonFetch(`${base}/api/v1/platform/snapshot/export`, {
        headers: platformAdminAuthz(token)
      })
      assert.equal(exp.resp.status, 200)
      const snap = JSON.parse(captured.body.toString('utf8'))

      const stores = snap.tables.find((t) => t.name === 'stores')
      assert.ok(stores && stores.rows.length > 0)
      for (const r of stores.rows) r.zombieColumn = 'should be dropped'
      snap.tables.push({ name: 'totally_unknown_table', rows: [{ id: 1, foo: 'bar' }] })
      const sampledMissingTable = snap.tables.find((t) => t.name === 'notifications')
      assert.ok(sampledMissingTable, 'expected notifications to be in the export')
      snap.tables = snap.tables.filter((t) => t.name !== 'notifications')

      const form = new FormData()
      form.append('file', new Blob([JSON.stringify(snap)], { type: 'application/json' }), 'platform.json')
      const r = await jsonFetch(`${base}/api/v1/platform/snapshot/import`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: form
      })
      assert.equal(r.resp.status, 200)
      const warnings = r.json.data?.warnings
      assert.ok(Array.isArray(warnings))
      const dropped = warnings.find((w) => w.kind === 'DROPPED_COLUMNS' && w.table === 'stores')
      assert.ok(dropped && dropped.columns.includes('zombieColumn'))
      const unknown = warnings.find((w) => w.kind === 'UNKNOWN_TABLE' && w.table === 'totally_unknown_table')
      assert.ok(unknown && unknown.rowCount === 1)
      const missing = warnings.find((w) => w.kind === 'MISSING_TABLE' && w.table === 'notifications')
      assert.ok(missing, 'expected MISSING_TABLE warning for notifications')

      // GTV was bumped; mint a fresh token to read the platform-scope success notification.
      const token2 = await getDevToken(base, 'ADMIN')
      const list = await jsonFetch(`${base}/api/v1/admin/notifications?status=UNREAD`, {
        headers: platformAdminAuthz(token2)
      })
      assert.equal(list.resp.status, 200)
      const items = list.json.data?.list
      assert.ok(Array.isArray(items))
      const notice = items.find((n) => n.type === 'PLATFORM_RESTORE_SUCCEEDED')
      assert.ok(notice, 'expected a PLATFORM_RESTORE_SUCCEEDED notification')
      assert.equal(notice.tenantId, null)
      assert.equal(notice.storeId, null)
      assert.ok(Array.isArray(notice.payload?.warnings))
      assert.ok(notice.payload.warnings.some((w) => w.kind === 'MISSING_TABLE' && w.table === 'notifications'))
    },
    () => {
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async (params) => {
        captured = params
        return { ETag: '"etag"', Location: `cos://${params.key}` }
      }
    },
    () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    },
    { withDb: true, withRedis: true }
  )
})

test('platform snapshot export/import works and restores timestamps', async () => {
  let originalPut = null
  let captured = null
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const r1 = await jsonFetch(`${base}/api/v1/platform/snapshot/export`, {
        headers: bearerAuthz(token)
      })
      assert.equal(r1.resp.status, 200)
      assert.ok(captured && Buffer.isBuffer(captured.body))
      const snap = JSON.parse(captured.body.toString('utf8'))
      assert.equal(snap.version, 1)
      assert.ok(Array.isArray(snap.tables))
      assert.ok(snap.tables.some((t) => t && t.name === 'stores'))

      const form = new FormData()
      form.append('file', new Blob([captured.body], { type: 'application/json' }), 'platform.json')
      const r2 = await jsonFetch(`${base}/api/v1/platform/snapshot/import`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: form
      })
      assert.equal(r2.resp.status, 200)
    },
    () => {
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async (params) => {
        captured = params
        return { ETag: '"etag"', Location: `cos://${params.key}` }
      }
    },
    () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    },
    { withDb: true, withRedis: true }
  )
})
