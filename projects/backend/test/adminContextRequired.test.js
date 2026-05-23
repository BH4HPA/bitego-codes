const test = require('node:test')
const assert = require('node:assert/strict')
const {
  withServer,
  loginAdmin,
  jsonFetch,
  bearerAuthz,
  adminAuthz,
  storeAdminAuthz,
  tenantAdminAuthz,
  platformAdminAuthz,
  getDevToken
} = require('./testUtils')

test('store-scoped admin APIs return 400 when AdminContext is missing', async () => {
  await withServer(async ({ base }) => {
    const { resp: loginResp, json: loginJson } = await loginAdmin(
      base,
      process.env.ADMIN_USERNAME,
      process.env.ADMIN_PASSWORD
    )
    assert.equal(loginResp.status, 200)
    const token = loginJson.data.token
    assert.ok(token)

    const overview = await jsonFetch(`${base}/api/v1/dashboard/overview`, {
      headers: bearerAuthz(token)
    })
    assert.equal(overview.resp.status, 400)
    assert.equal(overview.json.code, 40000)
    assert.match(String(overview.json.message || ''), /Missing store context/i)
  })
})

test('stores/current honors explicit AdminContext storeId header', async () => {
  await withServer(async ({ base }) => {
    const { resp: loginResp, json: loginJson } = await loginAdmin(
      base,
      process.env.ADMIN_USERNAME,
      process.env.ADMIN_PASSWORD
    )
    assert.equal(loginResp.status, 200)
    const token = loginJson.data.token

    const current = await jsonFetch(`${base}/api/v1/stores/current`, { headers: storeAdminAuthz(token) })
    assert.equal(current.resp.status, 200)
    assert.equal(current.json.data.storeId, 'store_default')
  })
})

test('store-scoped admin APIs reject mismatched board and store headers', async () => {
  await withServer(async ({ base }) => {
    const token = await getDevToken(base, 'ADMIN')
    const resp = await jsonFetch(`${base}/api/v1/dashboard/overview`, {
      headers: tenantAdminAuthz(token, 'store_default', { 'x-store-id': 'store_default' })
    })
    assert.equal(resp.resp.status, 400)
    assert.match(String(resp.json.message || ''), /Invalid admin context/i)
  })
})

test('platform-scoped admin APIs require SUPER_ADMIN context', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { AdminScope } = require('../dist/entities/AdminScope')
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const userId = `tenant_admin_${Date.now()}`
    const token = await getDevToken(base, 'ADMIN', userId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId: 'store_default',
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    const resp = await jsonFetch(`${base}/api/v1/platform/branding`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(token), 'content-type': 'application/json' },
      body: JSON.stringify({ platformName: 'BiteGo Z' })
    })
    assert.equal(resp.resp.status, 400)
    assert.match(String(resp.json.message || ''), /Missing admin context/i)
  })
})

test('admin APIs reject admin users without active scopes', async () => {
  await withServer(async ({ base }) => {
    const token = await getDevToken(base, 'ADMIN', `noscope_${Date.now()}`)
    const resp = await jsonFetch(`${base}/api/v1/dashboard/overview`, {
      headers: storeAdminAuthz(token)
    })
    assert.equal(resp.resp.status, 403)
    assert.match(String(resp.json.message || ''), /Forbidden/i)
  })
})

test('super admin without tenant or store ids rejects non-platform board', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { AdminScope } = require('../dist/entities/AdminScope')
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const userId = `super_${Date.now()}`
    const token = await getDevToken(base, 'ADMIN', userId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_super`,
        userId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )
    const resp = await jsonFetch(`${base}/api/v1/admin/maintenance`, {
      headers: adminAuthz(token, { board: 'tenant' })
    })
    assert.equal(resp.resp.status, 400)
    assert.match(String(resp.json.message || ''), /Invalid admin context/i)
  })
})
