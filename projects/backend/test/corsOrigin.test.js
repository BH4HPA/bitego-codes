const test = require('node:test')
const assert = require('node:assert/strict')
const { buildAllowedOrigins, normalizeOrigin, isOriginAllowed } = require('../dist/middlewares/corsOrigin')

test('normalizeOrigin strips trailing slash and path, returns null for junk', () => {
  assert.equal(normalizeOrigin('https://app.bitego.net/'), 'https://app.bitego.net')
  assert.equal(normalizeOrigin('https://admin.bitego.net'), 'https://admin.bitego.net')
  assert.equal(normalizeOrigin('https://app.bitego.net/some/path?x=1'), 'https://app.bitego.net')
  assert.equal(normalizeOrigin('http://192.0.2.125:10086/'), 'http://192.0.2.125:10086')
  assert.equal(normalizeOrigin(''), null)
  assert.equal(normalizeOrigin(undefined), null)
  assert.equal(normalizeOrigin('not-a-url'), null)
})

test('buildAllowedOrigins dedupes and skips empty entries', () => {
  const out = buildAllowedOrigins([
    'https://app.bitego.net/',
    'https://admin.bitego.net/',
    'https://app.bitego.net', // duplicate after normalize
    '',
    undefined
  ])
  assert.deepEqual(out, ['https://app.bitego.net', 'https://admin.bitego.net'])
})

test('isOriginAllowed: no Origin header always passes (miniprogram native, curl, server-to-server)', () => {
  assert.equal(isOriginAllowed(undefined, [], true), true)
  assert.equal(isOriginAllowed(undefined, ['https://app.bitego.net'], true), true)
  assert.equal(isOriginAllowed(undefined, [], false), true)
})

test('isOriginAllowed: non-strict (dev) echoes any Origin', () => {
  assert.equal(isOriginAllowed('http://localhost:5173', [], false), true)
  assert.equal(isOriginAllowed('http://192.0.2.125:10086', [], false), true)
  assert.equal(isOriginAllowed('https://evil.example.com', ['https://app.bitego.net'], false), true)
})

test('isOriginAllowed: strict (prod) only echoes whitelisted origins', () => {
  const allowed = ['https://app.bitego.net', 'https://admin.bitego.net']
  assert.equal(isOriginAllowed('https://app.bitego.net', allowed, true), true)
  assert.equal(isOriginAllowed('https://admin.bitego.net', allowed, true), true)
  assert.equal(isOriginAllowed('https://evil.example.com', allowed, true), false)
  assert.equal(isOriginAllowed('http://localhost:5173', allowed, true), false)
  // Case and scheme matter — Origin header is case-sensitive and must match exactly.
  assert.equal(isOriginAllowed('http://app.bitego.net', allowed, true), false)
  assert.equal(isOriginAllowed('https://APP.bitego.net', allowed, true), false)
})
