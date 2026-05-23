const test = require('node:test')
const assert = require('node:assert/strict')

test('requireAdminRole middleware covers missing/forbidden/ok paths', async () => {
  const { requireAdminRole } = require('../dist/middlewares/adminAuthz')
  const mw = requireAdminRole('SUPER_ADMIN')

  const makeRes = () => ({
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  })

  {
    const req = {}
    const res = makeRes()
    let nextCalled = false
    mw(req, res, () => {
      nextCalled = true
    })
    assert.equal(res.statusCode, 400)
    assert.equal(nextCalled, false)
  }

  {
    const req = { adminCtx: { adminRole: 'STORE_ADMIN' } }
    const res = makeRes()
    let nextCalled = false
    mw(req, res, () => {
      nextCalled = true
    })
    assert.equal(res.statusCode, 403)
    assert.equal(nextCalled, false)
  }

  {
    const req = { adminCtx: { adminRole: 'SUPER_ADMIN' } }
    const res = makeRes()
    let nextCalled = false
    mw(req, res, () => {
      nextCalled = true
    })
    assert.equal(res.statusCode, null)
    assert.equal(nextCalled, true)
  }
})

test('requireCatalogWrite middleware gates by canManageSharedCatalog', async () => {
  const { requireCatalogWrite } = require('../dist/middlewares/adminAuthz')
  const mw = requireCatalogWrite()

  const makeRes = () => ({
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  })

  {
    const req = { adminCtx: { canManageSharedCatalog: false } }
    const res = makeRes()
    let nextCalled = false
    mw(req, res, () => {
      nextCalled = true
    })
    assert.equal(res.statusCode, 403)
    assert.equal(nextCalled, false)
  }

  {
    const req = { adminCtx: { canManageSharedCatalog: true } }
    const res = makeRes()
    let nextCalled = false
    mw(req, res, () => {
      nextCalled = true
    })
    assert.equal(res.statusCode, null)
    assert.equal(nextCalled, true)
  }
})
