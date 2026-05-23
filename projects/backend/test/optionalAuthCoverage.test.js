const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { withHttpServer } = require('./testUtils')

test('optionalAuth returns 401 on invalid token', async () => {
  const { optionalAuth } = require('../dist/middlewares/auth')
  const app = express()
  app.get('/opt', optionalAuth, (req, res) => res.status(200).json({ ok: true, user: req.user || null }))
  await withHttpServer(app, async ({ base }) => {
    const r0 = await fetch(`${base}/opt`)
    assert.equal(r0.status, 200)

    const r1 = await fetch(`${base}/opt`, { headers: { authorization: 'Bearer invalid.token' } })
    assert.equal(r1.status, 401)
  })
})
