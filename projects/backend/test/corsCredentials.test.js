const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer } = require('./testUtils')

// Taro H5's `uploadFile` defaults `withCredentials = true`. When the server responds with the
// wildcard `Access-Control-Allow-Origin: *`, browsers refuse the request. The app must echo the
// request Origin and advertise `Access-Control-Allow-Credentials: true` so credentialed XHRs
// (upload/download) succeed.
test('CORS preflight echoes Origin and allows credentials', async () => {
  await withServer({ withDb: false, withRedis: false }, async ({ base }) => {
    const origin = 'http://192.0.2.166:10086'
    const preflight = await fetch(`${base}/api/v1/files`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type'
      }
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
    // When echoing Origin we must also Vary on it so intermediaries don't cache cross-origin.
    const vary = String(preflight.headers.get('vary') || '').toLowerCase()
    assert.ok(vary.includes('origin'), `expected Vary to include Origin, got "${vary}"`)
  })
})

test('CORS simple request echoes Origin on actual response', async () => {
  await withServer({ withDb: false, withRedis: false }, async ({ base }) => {
    const origin = 'http://localhost:10086'
    const res = await fetch(`${base}/health`, { headers: { origin } })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('access-control-allow-origin'), origin)
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
  })
})

// Strict mode (NODE_ENV=production) with an empty allowlist must fail-fast at createApp() time,
// so a missed env-var migration surfaces as a boot error rather than silent cross-origin denial.
test('createApp throws when strict mode has no allowed origins', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    H5APP_DOMAIN: process.env.H5APP_DOMAIN,
    WEBADMIN_DOMAIN: process.env.WEBADMIN_DOMAIN
  }
  process.env.NODE_ENV = 'production'
  delete process.env.H5APP_DOMAIN
  delete process.env.WEBADMIN_DOMAIN
  // Config is snapshotted at module load, so poke the loaded module's exports directly.
  const { config } = require('../dist/config')
  const prev = { nodeEnv: config.nodeEnv, h5: config.h5AppDomain, admin: config.webAdminDomain }
  config.nodeEnv = 'production'
  config.h5AppDomain = ''
  config.webAdminDomain = ''
  try {
    const { createApp } = require('../dist/app')
    assert.throws(() => createApp(), /CORS strict mode/)
  } finally {
    config.nodeEnv = prev.nodeEnv
    config.h5AppDomain = prev.h5
    config.webAdminDomain = prev.admin
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})
