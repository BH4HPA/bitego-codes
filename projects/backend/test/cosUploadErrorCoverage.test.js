const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, bearerAuthz } = require('./testUtils')

function png1x1Buffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/edp9WcAAAAASUVORK5CYII=',
    'base64'
  )
}

test('cos upload maps COS 403 to 40301', async () => {
  let originalPut
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const form = new FormData()
      form.append('path', 'goods')
      form.append('file', new Blob([png1x1Buffer()], { type: 'image/png' }), 'a.png')

      const resp = await fetch(`${base}/api/v1/files`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: form
      })
      assert.equal(resp.status, 403)
      const json = await resp.json()
      assert.equal(json.code, 40301)
    },
    async () => {
      process.env.COS_MAX_IMAGE_SIZE_BYTES = process.env.COS_MAX_IMAGE_SIZE_BYTES || '2048'
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async () => {
        const e = new Error('denied')
        e.statusCode = 403
        throw e
      }
    },
    async () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    }
  )
})
