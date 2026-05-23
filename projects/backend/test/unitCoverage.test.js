const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { withHttpServer, withRedis, makeRequestId, bearerAuthz } = require('./testUtils')

test('unit coverage for helpers/middlewares', async () => {
  await withRedis(async () => {
    const { getRedis } = require('../dist/redis')
    const errors = require('../dist/http/errors')
    const e1 = errors.badRequest('x')
    assert.equal(e1.httpStatus, 400)
    assert.equal(e1.code, 40000)

    const e1b = errors.businessError('biz', 40002)
    assert.equal(e1b.httpStatus, 400)
    assert.equal(e1b.code, 40002)

    const e2 = errors.unauthorized()
    assert.equal(e2.httpStatus, 401)
    assert.equal(e2.code, 40100)

    const e3 = errors.forbidden()
    assert.equal(e3.httpStatus, 403)

    const e4 = errors.notFound()
    assert.equal(e4.httpStatus, 404)

    const responses = require('../dist/http/responses')
    const resApp = express()
    resApp.get('/ok', (req, res) => responses.ok(res, { a: 1 }))
    resApp.get('/created', (req, res) => responses.created(res, { a: 1 }))
    resApp.get('/accepted', (req, res) => responses.accepted(res, { a: 1 }))
    resApp.get('/fail', (req, res) => responses.fail(res, 418, 41800, 'teapot'))
    await withHttpServer(resApp, async ({ base: resBase }) => {
      assert.equal((await fetch(`${resBase}/ok`)).status, 200)
      assert.equal((await fetch(`${resBase}/created`)).status, 201)
      assert.equal((await fetch(`${resBase}/accepted`)).status, 202)
      const fr = await fetch(`${resBase}/fail`)
      assert.equal(fr.status, 418)
      const fj = await fr.json()
      assert.equal(fj.success, false)
      assert.equal(fj.code, 41800)
    })

    const { errorHandler } = require('../dist/middlewares/errorHandler')
    const { AppError } = require('../dist/http/errors')

    const app = express()
    app.get('/err/app', (req, res, next) => {
      next(new AppError(418, 41800, 'teapot'))
    })
    app.get('/err/generic', (req, res) => {
      throw new Error('boom')
    })
    app.use(errorHandler)
    await withHttpServer(app, async ({ base }) => {
      const r1 = await fetch(`${base}/err/app`)
      assert.equal(r1.status, 418)
      const j1 = await r1.json()
      assert.equal(j1.code, 41800)

      const r2 = await fetch(`${base}/err/generic`)
      assert.equal(r2.status, 500)
      const j2 = await r2.json()
      assert.equal(j2.code, 50000)
    })

    const { requireIdempotency } = require('../dist/middlewares/idempotency')
    const app2 = express()
    app2.use(express.json())
    app2.post('/idem', requireIdempotency(60), (req, res) => {
      res.status(201).json({ success: true, code: 0, message: 'ok', data: { ts: Date.now() } })
    })
    await withHttpServer(app2, async ({ base: base2 }) => {
      const miss = await fetch(`${base2}/idem`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      })
      assert.equal(miss.status, 400)

      const reqId = makeRequestId('r')
      const a = await fetch(`${base2}/idem`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Request-Id': reqId },
        body: '{}'
      })
      assert.equal(a.status, 201)
      const ja = await a.json()

      const b = await fetch(`${base2}/idem`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Request-Id': reqId },
        body: '{}'
      })
      assert.equal(b.status, 201)
      const jb = await b.json()
      assert.deepEqual(jb, ja)

      const redis = getRedis()
      const badReqId = makeRequestId('bad')
      const badKey = `idem:POST:/idem:anonymous:${badReqId}`
      await redis.set(badKey, 'not-json', { EX: 60 })
      const c = await fetch(`${base2}/idem`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Request-Id': badReqId },
        body: '{}'
      })
      assert.equal(c.status, 201)
    })

    const { setMaintenanceState } = require('../dist/services/maintenance')
    const { maintenanceGuard } = require('../dist/middlewares/maintenance')
    const { getGlobalTokenVersion, bumpGlobalTokenVersion } = require('../dist/services/tokenVersion')
    const jwt = require('jsonwebtoken')
    const { config: cfg } = require('../dist/config')
    const { requireAuth } = require('../dist/middlewares/auth')

    const app3 = express()
    app3.use(maintenanceGuard)
    app3.get('/api/v1/categories', (req, res) => res.status(200).json({ ok: true }))
    app3.get('/api/v1/auth/ping', (req, res) => res.status(200).json({ ok: true }))
    app3.get('/secure', requireAuth, (req, res) => res.status(200).json({ ok: true }))
    await withHttpServer(app3, async ({ base: base3 }) => {
      await setMaintenanceState(true, 'maint')
      const m1 = await fetch(`${base3}/api/v1/categories`)
      assert.equal(m1.status, 503)
      const m2 = await fetch(`${base3}/api/v1/auth/ping`)
      assert.equal(m2.status, 200)

      await setMaintenanceState(false)
      const gtv = await getGlobalTokenVersion()
      const token = jwt.sign({ role: 'ADMIN', userId: 'admin_1', gtv }, cfg.jwtSecret, { expiresIn: '7d' })
      assert.equal((await fetch(`${base3}/secure`, { headers: bearerAuthz(token) })).status, 200)
      await bumpGlobalTokenVersion()
      assert.equal((await fetch(`${base3}/secure`, { headers: bearerAuthz(token) })).status, 401)
      await setMaintenanceState(false)
    })

    const { buildPublicUrl, cosPutObject } = require('../dist/qcloud/cos')
    const { config } = require('../dist/config')

    const old = { ...config.cos }
    try {
      config.cos.cdnDomain = 'https://cdn.example.com/'
      assert.equal(buildPublicUrl('/a/b.png'), 'https://cdn.example.com/a/b.png')

      config.cos.cdnDomain = ''
      config.cos.bucket = 'bkt-1250000000'
      config.cos.region = 'ap-guangzhou'
      assert.equal(buildPublicUrl('a/b.png'), 'https://bkt-1250000000.cos.ap-guangzhou.myqcloud.com/a/b.png')

      config.cos.bucket = ''
      config.cos.region = ''
      assert.equal(buildPublicUrl('a/b.png'), 'a/b.png')

      delete globalThis.__COS_PUT_OBJECT__
      config.cos.bucket = ''
      config.cos.region = ''
      config.cos.secretId = 'x'
      config.cos.secretKey = 'y'
      await assert.rejects(() => cosPutObject({ key: 'k', body: Buffer.from('x'), contentType: 'text/plain' }))

      config.cos.bucket = 'b'
      config.cos.region = 'r'
      config.cos.secretId = 'x'
      config.cos.secretKey = 'y'
      globalThis.__COS_CLIENT__ = {
        putObject(opts, cb) {
          cb(null, { ETag: '"etag"', Location: 'loc' })
        }
      }
      const okPut = await cosPutObject({ key: 'k', body: Buffer.from('x'), contentType: 'text/plain' })
      assert.equal(okPut.ETag, '"etag"')

      globalThis.__COS_CLIENT__ = {
        putObject(opts, cb) {
          cb(new Error('fail'))
        }
      }
      await assert.rejects(() => cosPutObject({ key: 'k', body: Buffer.from('x'), contentType: 'text/plain' }))
      delete globalThis.__COS_CLIENT__

      config.cos.secretId = ''
      config.cos.secretKey = ''
      await assert.rejects(() => cosPutObject({ key: 'k', body: Buffer.from('x'), contentType: 'text/plain' }))
    } finally {
      config.cos.secretId = old.secretId
      config.cos.secretKey = old.secretKey
      config.cos.bucket = old.bucket
      config.cos.region = old.region
      config.cos.cdnDomain = old.cdnDomain
      config.cos.maxImageSizeBytes = old.maxImageSizeBytes
    }
  })
})
