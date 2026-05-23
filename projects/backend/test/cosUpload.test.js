const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, bearerAuthz } = require('./testUtils')

function png1x1Buffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/edp9WcAAAAASUVORK5CYII=',
    'base64'
  )
}

test('cos image upload', async () => {
  let originalPut
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      assert.ok(token)

      const form = new FormData()
      form.append('path', 'goods')
      form.append('file', new Blob([png1x1Buffer()], { type: 'image/png' }), 'a.png')

      const resp = await fetch(`${base}/api/v1/files`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: form
      })
      assert.equal(resp.status, 200)
      const json = await resp.json()
      assert.equal(json.success, true)
      assert.ok(json.data.key.startsWith('images/goods/'))
      assert.ok(json.data.key.endsWith('.png'))
      assert.equal(json.data.mime, 'image/png')
      assert.ok(String(json.data.publicUrl).startsWith('https://cdn.example.com/'))
    },
    async () => {
      process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'
      process.env.COS_MAX_IMAGE_SIZE_BYTES = process.env.COS_MAX_IMAGE_SIZE_BYTES || '2048'
      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async ({ key }) => ({ ETag: '"etag"', Location: `cos://${key}` })
    },
    async () => {
      globalThis.__COS_PUT_OBJECT__ = originalPut
    },
    { withDb: false, withRedis: false }
  )
})

test('cos upload rejects non-image', async () => {
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')

      const form = new FormData()
      form.append('path', 'goods')
      form.append('file', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'a.txt')

      const resp = await fetch(`${base}/api/v1/files`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: form
      })
      assert.equal(resp.status, 415)
      const json = await resp.json()
      assert.equal(json.success, false)
      assert.equal(json.code, 41501)
    },
    async () => {
      process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'
      process.env.COS_MAX_IMAGE_SIZE_BYTES = process.env.COS_MAX_IMAGE_SIZE_BYTES || '2048'
    },
    null,
    { withDb: false, withRedis: false }
  )
})

test('cos upload rejects too large', async () => {
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')

      const form = new FormData()
      form.append('path', 'goods')
      form.append('file', new Blob([Buffer.alloc(4096)], { type: 'image/png' }), 'a.png')

      const resp = await fetch(`${base}/api/v1/files`, {
        method: 'POST',
        headers: bearerAuthz(token),
        body: form
      })
      assert.equal(resp.status, 413)
      const json = await resp.json()
      assert.equal(json.success, false)
      assert.equal(json.code, 41301)
    },
    async () => {
      process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'
      process.env.COS_MAX_IMAGE_SIZE_BYTES = process.env.COS_MAX_IMAGE_SIZE_BYTES || '2048'
    },
    null,
    { withDb: false, withRedis: false }
  )
})
