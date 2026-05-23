const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch, getDevToken, storeAdminAuthz } = require('./testUtils')

test('h5 login issues customer token and creates user', async () => {
  await withServer(
    async ({ base }) => {
      const r1 = await jsonFetch(`${base}/api/v1/auth/h5/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
      assert.equal(r1.resp.status, 200)
      assert.ok(r1.json?.data?.token)
      assert.ok(r1.json?.data?.user?.userId)

      const token = r1.json.data.token
      const me = await jsonFetch(`${base}/api/v1/users/me`, { headers: { authorization: `Bearer ${token}` } })
      assert.equal(me.resp.status, 200)
      assert.equal(me.json.data.userId, r1.json.data.user.userId)

      const bad = await jsonFetch(`${base}/api/v1/auth/h5/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'x'.repeat(65) })
      })
      assert.equal(bad.resp.status, 400)

      const fixed = await jsonFetch(`${base}/api/v1/auth/h5/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'usr_fixed', nickname: 'N', avatarUrl: 'A' })
      })
      assert.equal(fixed.resp.status, 200)
      assert.equal(fixed.json.data.user.userId, 'usr_fixed')

      const again = await jsonFetch(`${base}/api/v1/auth/h5/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'usr_fixed' })
      })
      assert.equal(again.resp.status, 200)
      assert.equal(again.json.data.user.userId, 'usr_fixed')
    },
    async () => {
      process.env.H5APP_DOMAIN = process.env.H5APP_DOMAIN || 'https://app.example.com'
    }
  )
})

test('tables h5 qrcode generation and regenerate', async () => {
  const prev = { h5AppDomain: null, bucket: null, region: null }
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')

      const created = await jsonFetch(`${base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...storeAdminAuthz(token, 'store_default', 'store_default'), 'content-type': 'application/json' },
        body: JSON.stringify({ code: `A_${Date.now()}`, status: 'FREE' })
      })
      assert.equal(created.resp.status, 201)
      assert.ok(created.json.data.tableId)
      assert.ok(created.json.data.h5QrcodeUrl)

      const tableId = created.json.data.tableId
      const first = String(created.json.data.h5QrcodeUrl)

      const listed = await jsonFetch(`${base}/api/v1/tables?page=1&pageSize=50`, {
        headers: storeAdminAuthz(token, 'store_default', 'store_default')
      })
      assert.equal(listed.resp.status, 200)
      assert.ok(listed.json.data.list.some((t) => t.tableId === tableId && t.h5QrcodeUrl))

      await new Promise((r) => setTimeout(r, 2))
      const regen = await jsonFetch(`${base}/api/v1/tables/${encodeURIComponent(tableId)}/h5-qrcode`, {
        method: 'POST',
        headers: storeAdminAuthz(token, 'store_default', 'store_default')
      })
      assert.equal(regen.resp.status, 200)
      assert.ok(regen.json.data.h5QrcodeUrl)
      assert.notEqual(String(regen.json.data.h5QrcodeUrl), first)
    },
    async () => {
      const { config } = require('../dist/config')
      prev.h5AppDomain = config.h5AppDomain
      prev.bucket = config.cos.bucket
      prev.region = config.cos.region
      config.h5AppDomain = 'https://app.example.com'
      config.cos.bucket = 'bucket-test'
      config.cos.region = 'ap-test'
      globalThis.__COS_PUT_OBJECT__ = async () => ({ ETag: 'etag', Location: 'loc' })
    },
    async () => {
      const { config } = require('../dist/config')
      config.h5AppDomain = prev.h5AppDomain
      config.cos.bucket = prev.bucket
      config.cos.region = prev.region
      delete globalThis.__COS_PUT_OBJECT__
    }
  )
})

test('tables h5 qrcode endpoint guards', async () => {
  const prev = { h5AppDomain: null }
  await withServer(
    async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')

      const missing = await jsonFetch(`${base}/api/v1/tables/tbl_missing_${Date.now()}/h5-qrcode`, {
        method: 'POST',
        headers: storeAdminAuthz(token, 'store_default', 'store_default')
      })
      assert.equal(missing.resp.status, 404)

      const created = await jsonFetch(`${base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...storeAdminAuthz(token, 'store_default', 'store_default'), 'content-type': 'application/json' },
        body: JSON.stringify({ code: `B_${Date.now()}`, status: 'FREE' })
      })
      assert.equal(created.resp.status, 201)
      const tableId = created.json.data.tableId

      const noDomain = await jsonFetch(`${base}/api/v1/tables/${encodeURIComponent(tableId)}/h5-qrcode`, {
        method: 'POST',
        headers: storeAdminAuthz(token, 'store_default', 'store_default')
      })
      assert.equal(noDomain.resp.status, 409)

      const { config } = require('../dist/config')
      config.h5AppDomain = 'https://app.example.com'
      const noCos = await jsonFetch(`${base}/api/v1/tables/${encodeURIComponent(tableId)}/h5-qrcode`, {
        method: 'POST',
        headers: storeAdminAuthz(token, 'store_default', 'store_default')
      })
      assert.equal(noCos.resp.status, 409)
    },
    async () => {
      const { config } = require('../dist/config')
      prev.h5AppDomain = config.h5AppDomain
      config.h5AppDomain = ''
    },
    async () => {
      const { config } = require('../dist/config')
      config.h5AppDomain = prev.h5AppDomain
    }
  )
})
