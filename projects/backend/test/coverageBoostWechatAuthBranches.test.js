const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch } = require('./testUtils')

test('wechat auth login covers error branches', async () => {
  await withServer(
    async ({ base }) => {
      const { config } = require('../dist/config')
      const prevAppId = config.wechatMiniProgram.appId
      const prevSecret = config.wechatMiniProgram.secret
      const prevFetcher = globalThis.__WX_FETCH__
      try {
        const codeReuse = `c_reuse_${Date.now()}_${Math.random()}`
        const codeFetchErr = `c_fetch_err_${Date.now()}_${Math.random()}`
        const codeMissingIds = `c_missing_ids_${Date.now()}_${Math.random()}`
        const invalidCode = await jsonFetch(`${base}/api/v1/auth/wechat/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        })
        assert.equal(invalidCode.resp.status, 400)

        config.wechatMiniProgram.appId = ''
        config.wechatMiniProgram.secret = ''
        const missingCreds = await jsonFetch(`${base}/api/v1/auth/wechat/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: 'c_missing' })
        })
        assert.equal(missingCreds.resp.status, 500)

        config.wechatMiniProgram.appId = 'wx_test'
        config.wechatMiniProgram.secret = 'wx_secret'
        globalThis.__WX_FETCH__ = async () =>
          new Response(JSON.stringify({ openid: 'o1', session_key: 'sk1', unionid: 'u1', errcode: 0 }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        const okFirst = await jsonFetch(`${base}/api/v1/auth/wechat/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: codeReuse, nickname: 'n1', avatarUrl: 'a1' })
        })
        assert.equal(okFirst.resp.status, 200)
        const reuse = await jsonFetch(`${base}/api/v1/auth/wechat/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: codeReuse })
        })
        assert.equal(reuse.resp.status, 400)

        globalThis.__WX_FETCH__ = async () => {
          throw new Error('fetch boom')
        }
        const fetchErr = await jsonFetch(`${base}/api/v1/auth/wechat/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: codeFetchErr })
        })
        assert.equal(fetchErr.resp.status, 500)

        globalThis.__WX_FETCH__ = async () =>
          new Response(JSON.stringify({ errcode: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })
        const missingIds = await jsonFetch(`${base}/api/v1/auth/wechat/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: codeMissingIds })
        })
        assert.equal(missingIds.resp.status, 500)
      } finally {
        config.wechatMiniProgram.appId = prevAppId
        config.wechatMiniProgram.secret = prevSecret
        globalThis.__WX_FETCH__ = prevFetcher
      }
    },
    null,
    null,
    { withDb: true, withRedis: true }
  )
})
