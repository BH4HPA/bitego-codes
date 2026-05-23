const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, platformAdminAuthz } = require('./testUtils')

test('platform snapshot import normalizes ISO datetime strings', async () => {
  let originalPut
  let captured
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')

      const exported = await jsonFetch(`${base}/api/v1/platform/snapshot/export`, {
        headers: platformAdminAuthz(token)
      })
      assert.equal(exported.resp.status, 200)
      assert.ok(captured)

      const snapshot = JSON.parse(captured)
      let injected = false
      for (const t of snapshot.tables) {
        if (!t?.rows?.length) continue
        const row = t.rows[0]
        if (!row || typeof row !== 'object') continue
        if (Object.prototype.hasOwnProperty.call(row, 'createdAt')) {
          row.createdAt = '2026-01-01T00:00:00Z'
          injected = true
          break
        }
        if (Object.prototype.hasOwnProperty.call(row, 'updatedAt')) {
          row.updatedAt = '2026-01-01T00:00:00Z'
          injected = true
          break
        }
      }
      assert.equal(injected, true)

      const form = new FormData()
      form.append('file', new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), 'platform.json')
      const imported = await jsonFetch(`${base}/api/v1/platform/snapshot/import`, {
        method: 'POST',
        headers: platformAdminAuthz(token),
        body: form
      })
      assert.equal(imported.resp.status, 200)
    },
    async () => {
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async ({ body }) => {
        captured = body.toString('utf8')
      }
    },
    async () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    }
  )
})
