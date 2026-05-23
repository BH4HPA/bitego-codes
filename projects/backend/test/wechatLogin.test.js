const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { withServer, customerAuthz } = require('./testUtils')

test('wechat miniprogram login', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  const openid = `openid_${suffix}`
  const sessionKeyRaw = crypto.randomBytes(16)
  const sessionKeyB64 = sessionKeyRaw.toString('base64')
  let originalWxFetch
  await withServer(
    async ({ base }) => {
      const { config } = require('../dist/config')
      const { getRedis } = require('../dist/redis')

      originalWxFetch = globalThis.__WX_FETCH__
      globalThis.__WX_FETCH__ = async () => {
        return {
          async json() {
            return { openid, session_key: sessionKeyB64, unionid: `union_${suffix}`, errcode: 0, errmsg: 'ok' }
          }
        }
      }

      const loginResp = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `code_${suffix}`, nickname: '小明', avatarUrl: 'https://a.b/c.png' })
      })
      assert.equal(loginResp.status, 200)
      const loginJson = await loginResp.json()
      assert.equal(loginJson.success, true)
      assert.ok(loginJson.data.token)
      assert.ok(loginJson.data.user.userId)

      const token = loginJson.data.token

      const meResp = await fetch(`${base}/api/v1/users/me`, { headers: customerAuthz(token) })
      assert.equal(meResp.status, 200)
      const meJson = await meResp.json()
      assert.equal(meJson.data.userId, loginJson.data.user.userId)
      assert.equal(meJson.data.userType, 'CUSTOMER')

      const phonePayload = {
        phoneNumber: '13800138000',
        purePhoneNumber: '13800138000',
        countryCode: '86',
        watermark: { appid: config.wechatMiniProgram.appId, timestamp: Math.floor(Date.now() / 1000) }
      }
      const ivRaw = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv('aes-128-cbc', sessionKeyRaw, ivRaw)
      cipher.setAutoPadding(true)
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(JSON.stringify(phonePayload), 'utf8')),
        cipher.final()
      ]).toString('base64')
      const ivB64 = ivRaw.toString('base64')

      const phoneResp = await fetch(`${base}/api/v1/users/me/phone`, {
        method: 'POST',
        headers: { ...customerAuthz(token), 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedData: encrypted, iv: ivB64 })
      })
      assert.equal(phoneResp.status, 200)
      const phoneJson = await phoneResp.json()
      assert.equal(phoneJson.data.phoneNumber, '13800138000')

      const redis = getRedis()
      const cachedSk = await redis.get(`wxsk:${loginJson.data.user.userId}`)
      assert.ok(cachedSk)
    },
    async () => {
      process.env.WX_MINIPROGRAM_APPID = process.env.WX_MINIPROGRAM_APPID || 'wx_test_appid'
      process.env.WX_MINIPROGRAM_SECRET = process.env.WX_MINIPROGRAM_SECRET || 'wx_test_secret'
      process.env.WX_SESSION_KEY_TTL_SECONDS = process.env.WX_SESSION_KEY_TTL_SECONDS || '60'
    },
    async () => {
      globalThis.__WX_FETCH__ = originalWxFetch
    }
  )
})

test('wechat miniprogram login invalid code', async () => {
  let originalWxFetch
  await withServer(
    async ({ base }) => {
      originalWxFetch = globalThis.__WX_FETCH__
      globalThis.__WX_FETCH__ = async () => {
        return {
          async json() {
            return { errcode: 40029, errmsg: 'invalid code' }
          }
        }
      }

      const resp = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `bad_${Date.now()}` })
      })
      assert.equal(resp.status, 400)
      const json = await resp.json()
      assert.equal(json.success, false)
      assert.equal(json.code, 40001)
    },
    async () => {
      process.env.WX_MINIPROGRAM_APPID = process.env.WX_MINIPROGRAM_APPID || 'wx_test_appid'
      process.env.WX_MINIPROGRAM_SECRET = process.env.WX_MINIPROGRAM_SECRET || 'wx_test_secret'
    },
    async () => {
      globalThis.__WX_FETCH__ = originalWxFetch
    }
  )
})
