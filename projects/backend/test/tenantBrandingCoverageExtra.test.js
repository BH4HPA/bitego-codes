const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, tenantAdminAuthz } = require('./testUtils')

test('tenant branding covers normalize branches', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantId = `t_${Date.now()}`
    const storeId = `s_${Date.now()}`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: 'https://x/logo.png',
        primaryStoreId: storeId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'S',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const userId = `ta_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const invalidType = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(token, tenantId, { 'content-type': 'application/json' }),
      body: JSON.stringify({ brandLogoUrl: 123 })
    })
    assert.equal(invalidType.resp.status, 400)
    assert.equal(invalidType.json.code, 40000)

    const invalidBrandNameType = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(token, tenantId, { 'content-type': 'application/json' }),
      body: JSON.stringify({ brandName: 123 })
    })
    assert.equal(invalidBrandNameType.resp.status, 400)
    assert.equal(invalidBrandNameType.json.code, 40000)

    const setNull = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(token, tenantId, { 'content-type': 'application/json' }),
      body: JSON.stringify({ brandLogoUrl: null })
    })
    assert.equal(setNull.resp.status, 200)
    assert.equal(setNull.json.data.brandLogoUrl, null)

    const setBlank = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(token, tenantId, { 'content-type': 'application/json' }),
      body: JSON.stringify({ brandLogoUrl: '   ' })
    })
    assert.equal(setBlank.resp.status, 200)
    assert.equal(setBlank.json.data.brandLogoUrl, null)

    const setTrimName = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: tenantAdminAuthz(token, tenantId, { 'content-type': 'application/json' }),
      body: JSON.stringify({ brandName: '  Brand3  ' })
    })
    assert.equal(setTrimName.resp.status, 200)
    assert.equal(setTrimName.json.data.brandName, 'Brand3')

    const get = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      headers: tenantAdminAuthz(token, tenantId)
    })
    assert.equal(get.resp.status, 200)
    assert.equal(get.json.data.brandLogoUrl, null)
  })
})
