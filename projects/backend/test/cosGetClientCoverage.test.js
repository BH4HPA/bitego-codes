const test = require('node:test')
const assert = require('node:assert/strict')

test('cosPutObject can instantiate COS client via credentials', async () => {
  const Cos = require('cos-nodejs-sdk-v5')
  const originalPutObject = Cos.prototype.putObject
  Cos.prototype.putObject = function (_params, cb) {
    cb(null, { statusCode: 200 })
  }

  const { config } = require('../dist/config')
  const originalCosCfg = { ...config.cos }
  config.cos.secretId = 'sid'
  config.cos.secretKey = 'skey'
  config.cos.bucket = 'bucket'
  config.cos.region = 'region'

  const cacheKey = require.resolve('../dist/qcloud/cos')
  delete require.cache[cacheKey]
  const { cosPutObject } = require('../dist/qcloud/cos')

  const originalClient = globalThis.__COS_CLIENT__
  const originalOverride = globalThis.__COS_PUT_OBJECT__
  delete globalThis.__COS_CLIENT__
  delete globalThis.__COS_PUT_OBJECT__

  try {
    const r = await cosPutObject({ key: 't.txt', body: Buffer.from('x'), contentType: 'text/plain' })
    assert.ok(r)
  } finally {
    Cos.prototype.putObject = originalPutObject
    config.cos.secretId = originalCosCfg.secretId
    config.cos.secretKey = originalCosCfg.secretKey
    config.cos.bucket = originalCosCfg.bucket
    config.cos.region = originalCosCfg.region
    globalThis.__COS_CLIENT__ = originalClient
    globalThis.__COS_PUT_OBJECT__ = originalOverride
  }
})
