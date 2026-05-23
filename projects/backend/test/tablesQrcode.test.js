const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, storeAdminAuthz } = require('./testUtils')

function png1x1Buffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/edp9WcAAAAASUVORK5CYII=',
    'base64'
  )
}

test('table create generates mini program qrcode and stores url', async () => {
  let originalWxFetch
  let originalCosPut
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const authz = storeAdminAuthz(token)
      const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const code = `A_${suffix}`

      const resp = await fetch(`${base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      })
      assert.equal(resp.status, 201)
      const json = await resp.json()
      assert.equal(json.success, true)
      assert.ok(json.data.tableId)
      assert.ok(String(json.data.qrcodeUrl).startsWith('https://cdn.example.com/qrcode/table/'))
      assert.ok(String(json.data.qrcodeUrl).includes(`${json.data.tableId}_`))
      assert.ok(String(json.data.qrcodeUrl).endsWith('.png'))

      const listResp = await fetch(`${base}/api/v1/tables?page=1&pageSize=50`, { headers: authz })
      assert.equal(listResp.status, 200)
      const listJson = await listResp.json()
      const found = listJson.data.list.find((t) => t.tableId === json.data.tableId)
      assert.ok(found)
      assert.equal(found.qrcodeUrl, json.data.qrcodeUrl)
    },
    async () => {
      process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'
      process.env.WX_MINIPROGRAM_APPID = process.env.WX_MINIPROGRAM_APPID || 'wx_appid'
      process.env.WX_MINIPROGRAM_SECRET = process.env.WX_MINIPROGRAM_SECRET || 'wx_secret'
      originalWxFetch = globalThis.__WX_FETCH__
      originalCosPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__WX_FETCH__ = async (url) => {
        if (String(url).includes('/cgi-bin/stable_token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'stable-token', expires_in: 7200 })
          }
        }
        if (String(url).includes('/wxa/getwxacodeunlimit')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => png1x1Buffer()
          }
        }
        throw new Error(`Unexpected url: ${url}`)
      }
      globalThis.__COS_PUT_OBJECT__ = async ({ key }) => ({ ETag: '"etag"', Location: `cos://${key}` })
    },
    async () => {
      globalThis.__WX_FETCH__ = originalWxFetch
      globalThis.__COS_PUT_OBJECT__ = originalCosPut
    }
  )
})

test('table create fails when wechat qrcode fails and does not keep table row', async () => {
  let originalWxFetch
  let originalCosPut
  await withServer(
    async ({ base, AppDataSource }) => {
      const token = await getDevToken(base, 'ADMIN')
      const authz = storeAdminAuthz(token)
      const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const code = `B_${suffix}`

      const resp = await fetch(`${base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      })
      assert.equal(resp.status, 500)

      const { Table } = require('../dist/entities/Table')
      const repo = AppDataSource.getRepository(Table)
      const row = await repo.findOne({ where: { code } })
      assert.equal(row, null)
    },
    async () => {
      process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'
      process.env.WX_MINIPROGRAM_APPID = process.env.WX_MINIPROGRAM_APPID || 'wx_appid'
      process.env.WX_MINIPROGRAM_SECRET = process.env.WX_MINIPROGRAM_SECRET || 'wx_secret'
      originalWxFetch = globalThis.__WX_FETCH__
      originalCosPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__WX_FETCH__ = async (url) => {
        if (String(url).includes('/cgi-bin/stable_token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'stable-token', expires_in: 7200 })
          }
        }
        if (String(url).includes('/wxa/getwxacodeunlimit')) {
          const body = Buffer.from(JSON.stringify({ errcode: 40097, errmsg: 'invalid args' }), 'utf8')
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            arrayBuffer: async () => body
          }
        }
        throw new Error(`Unexpected url: ${url}`)
      }
      globalThis.__COS_PUT_OBJECT__ = async ({ key }) => ({ ETag: '"etag"', Location: `cos://${key}` })
    },
    async () => {
      globalThis.__WX_FETCH__ = originalWxFetch
      globalThis.__COS_PUT_OBJECT__ = originalCosPut
    }
  )
})

test('table qrcode regenerate supports envVersion', async () => {
  let originalWxFetch
  let originalCosPut
  let lastEnvVersion = null
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const authz = storeAdminAuthz(token)
      const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const code = `C_${suffix}`

      const resp = await fetch(`${base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      })
      assert.equal(resp.status, 201)
      const json = await resp.json()
      const tableId = json.data.tableId
      const firstUrl = json.data.qrcodeUrl
      assert.ok(tableId)
      assert.ok(firstUrl)

      const regenResp = await fetch(`${base}/api/v1/tables/${tableId}/qrcode`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ envVersion: 'trial' })
      })
      assert.equal(regenResp.status, 200)
      const regenJson = await regenResp.json()
      assert.equal(regenJson.success, true)
      assert.equal(regenJson.data.tableId, tableId)
      assert.equal(regenJson.data.envVersion, 'trial')
      assert.ok(regenJson.data.qrcodeUrl)
      assert.notEqual(regenJson.data.qrcodeUrl, firstUrl)
      assert.equal(lastEnvVersion, 'trial')
    },
    async () => {
      process.env.QCLOUD_COS_CDN_DOMAIN = process.env.QCLOUD_COS_CDN_DOMAIN || 'https://cdn.example.com'
      process.env.WX_MINIPROGRAM_APPID = process.env.WX_MINIPROGRAM_APPID || 'wx_appid'
      process.env.WX_MINIPROGRAM_SECRET = process.env.WX_MINIPROGRAM_SECRET || 'wx_secret'
      originalWxFetch = globalThis.__WX_FETCH__
      originalCosPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__WX_FETCH__ = async (url, init) => {
        if (String(url).includes('/cgi-bin/stable_token')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'stable-token', expires_in: 7200 })
          }
        }
        if (String(url).includes('/wxa/getwxacodeunlimit')) {
          const body = init && init.body ? JSON.parse(String(init.body)) : {}
          lastEnvVersion = body.env_version || null
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => png1x1Buffer()
          }
        }
        throw new Error(`Unexpected url: ${url}`)
      }
      globalThis.__COS_PUT_OBJECT__ = async ({ key }) => ({ ETag: '"etag"', Location: `cos://${key}` })
    },
    async () => {
      globalThis.__WX_FETCH__ = originalWxFetch
      globalThis.__COS_PUT_OBJECT__ = originalCosPut
    }
  )
})
