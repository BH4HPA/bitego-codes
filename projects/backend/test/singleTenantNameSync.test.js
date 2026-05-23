const test = require('node:test')
const assert = require('node:assert/strict')
const {
  withServer,
  getDevToken,
  jsonFetch,
  platformAdminAuthz,
  tenantAdminAuthz,
  storeAdminAuthz
} = require('./testUtils')

async function seedTenant(ctx, { type = 'SINGLE', brandName = 'Brand', suffix }) {
  const Tenant = require('../dist/entities/Tenant').Tenant
  const Store = require('../dist/entities/Store').Store
  const tenantId = `t_${type.toLowerCase()}_${suffix}`
  const storeId = `s_${type.toLowerCase()}_${suffix}`
  const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
  const storeRepo = ctx.AppDataSource.getRepository(Store)
  await tenantRepo.save(
    tenantRepo.create({
      tenantId,
      type,
      brandName,
      brandLogoUrl: null,
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
      name: brandName,
      logoUrl: '',
      phone: '',
      address: '',
      description: ''
    })
  )
  return { tenantId, storeId }
}

async function grantScope(ctx, { userId, tenantId, storeId = null, role }) {
  const AdminScope = require('../dist/entities/AdminScope').AdminScope
  const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
  await scopeRepo.save(
    scopeRepo.create({
      scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      userId,
      tenantId,
      storeId,
      role,
      status: 'ACTIVE'
    })
  )
}

async function readTenantAndStore(ctx, tenantId, storeId) {
  const Tenant = require('../dist/entities/Tenant').Tenant
  const Store = require('../dist/entities/Store').Store
  const tenant = await ctx.AppDataSource.getRepository(Tenant).findOne({ where: { tenantId } })
  const store = await ctx.AppDataSource.getRepository(Store).findOne({ where: { storeId } })
  return { tenant, store }
}

test('SINGLE tenant: PUT /stores/current renames store and syncs tenant.brandName', async () => {
  await withServer(async (ctx) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const { tenantId, storeId } = await seedTenant(ctx, { suffix, brandName: 'Old' })

    const token = await getDevToken(ctx.base, 'ADMIN', `u_${suffix}`)
    await grantScope(ctx, { userId: `u_${suffix}`, tenantId, storeId, role: 'TENANT_ADMIN' })

    const r = await jsonFetch(`${ctx.base}/api/v1/stores/current`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'NewStoreName' })
    })
    assert.equal(r.resp.status, 200)

    const { tenant, store } = await readTenantAndStore(ctx, tenantId, storeId)
    assert.equal(store.name, 'NewStoreName')
    assert.equal(tenant.brandName, 'NewStoreName')
  })
})

test('SINGLE tenant: PUT /platform/stores/:storeId renames store and syncs tenant.brandName', async () => {
  await withServer(async (ctx) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const { tenantId, storeId } = await seedTenant(ctx, { suffix, brandName: 'Old' })

    const superUserId = `super_${suffix}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    await grantScope(ctx, { userId: superUserId, tenantId: 'store_default', role: 'SUPER_ADMIN' })

    const r = await jsonFetch(`${ctx.base}/api/v1/platform/stores/${encodeURIComponent(storeId)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'PlatformRenamed' })
    })
    assert.equal(r.resp.status, 200)

    const { tenant, store } = await readTenantAndStore(ctx, tenantId, storeId)
    assert.equal(store.name, 'PlatformRenamed')
    assert.equal(tenant.brandName, 'PlatformRenamed')
  })
})

test('SINGLE tenant: PUT /tenant/branding with brandName syncs to primary store.name', async () => {
  await withServer(async (ctx) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const { tenantId, storeId } = await seedTenant(ctx, { suffix, brandName: 'Old' })

    const userId = `ta_${suffix}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    await grantScope(ctx, { userId, tenantId, role: 'TENANT_ADMIN' })

    const r = await jsonFetch(`${ctx.base}/api/v1/tenant/branding`, {
      method: 'PUT',
      headers: { ...tenantAdminAuthz(token, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ brandName: 'BrandingRenamed' })
    })
    assert.equal(r.resp.status, 200)

    const { tenant, store } = await readTenantAndStore(ctx, tenantId, storeId)
    assert.equal(tenant.brandName, 'BrandingRenamed')
    assert.equal(store.name, 'BrandingRenamed')
  })
})

test('SINGLE tenant: PUT /platform/tenants/:tenantId with brandName syncs to primary store.name', async () => {
  await withServer(async (ctx) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const { tenantId, storeId } = await seedTenant(ctx, { suffix, brandName: 'Old' })

    const superUserId = `super_${suffix}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    await grantScope(ctx, { userId: superUserId, tenantId: 'store_default', role: 'SUPER_ADMIN' })

    const r = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ brandName: 'PlatformTenantRenamed' })
    })
    assert.equal(r.resp.status, 200)

    const { tenant, store } = await readTenantAndStore(ctx, tenantId, storeId)
    assert.equal(tenant.brandName, 'PlatformTenantRenamed')
    assert.equal(store.name, 'PlatformTenantRenamed')
  })
})

test('CHAIN tenant: store rename does NOT touch tenant.brandName, and brand rename does NOT touch store.name', async () => {
  await withServer(async (ctx) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const { tenantId, storeId } = await seedTenant(ctx, { type: 'CHAIN', suffix, brandName: 'ChainBrand' })

    const superUserId = `super_${suffix}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    await grantScope(ctx, { userId: superUserId, tenantId: 'store_default', role: 'SUPER_ADMIN' })

    // Rename a CHAIN store; brandName must not move.
    const r1 = await jsonFetch(`${ctx.base}/api/v1/platform/stores/${encodeURIComponent(storeId)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'BranchRenamed' })
    })
    assert.equal(r1.resp.status, 200)

    let after = await readTenantAndStore(ctx, tenantId, storeId)
    assert.equal(after.store.name, 'BranchRenamed')
    assert.equal(after.tenant.brandName, 'ChainBrand')

    // Rename CHAIN brandName; primary store.name must not move.
    const r2 = await jsonFetch(`${ctx.base}/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ brandName: 'ChainBrand2' })
    })
    assert.equal(r2.resp.status, 200)

    after = await readTenantAndStore(ctx, tenantId, storeId)
    assert.equal(after.store.name, 'BranchRenamed')
    assert.equal(after.tenant.brandName, 'ChainBrand2')
  })
})
