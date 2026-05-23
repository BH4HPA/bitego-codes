const test = require('node:test')
const assert = require('node:assert/strict')
const {
  withServer,
  getDevToken,
  jsonFetch,
  bearerAuthz,
  platformAdminAuthz,
  tenantAdminAuthz,
  storeAdminAuthz
} = require('./testUtils')

test('admin scopes: me list, super admin manage scopes, tenant admin manage store scopes', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantIdA = `t_${Date.now()}_a`
    const tenantIdB = `t_${Date.now()}_b`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId: tenantIdA,
        type: 'CHAIN',
        brandName: 'A',
        brandLogoUrl: null,
        primaryStoreId: null,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )
    await tenantRepo.save(
      tenantRepo.create({
        tenantId: tenantIdB,
        type: 'CHAIN',
        brandName: 'B',
        brandLogoUrl: null,
        primaryStoreId: null,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    const storeA1 = `s_${Date.now()}_a1`
    const storeB1 = `s_${Date.now()}_b1`
    await storeRepo.save(
      storeRepo.create({
        storeId: storeA1,
        tenantId: tenantIdA,
        isPrimary: 0,
        subName: null,
        name: 'A1',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: storeB1,
        tenantId: tenantIdB,
        isPrimary: 0,
        subName: null,
        name: 'B1',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)

    const superUserId = `super_${Date.now()}`
    const superToken = await getDevToken(ctx.base, 'ADMIN', superUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: superUserId,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )

    const me1 = await jsonFetch(`${ctx.base}/api/v1/admin/me/scopes`, {
      headers: bearerAuthz(superToken)
    })
    assert.equal(me1.resp.status, 200)
    assert.ok(Array.isArray(me1.json.data.list))
    assert.equal(
      me1.json.data.list.some((s) => s.role === 'SUPER_ADMIN'),
      true
    )

    const meWithWrongCtx = await jsonFetch(`${ctx.base}/api/v1/admin/me/scopes`, {
      headers: bearerAuthz(superToken, { 'x-board': 'tenant', 'x-tenant-id': 'store_default' })
    })
    assert.equal(meWithWrongCtx.resp.status, 200)

    const targetUserId = `u_${Date.now()}`
    const createTenantAdmin = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId, tenantId: tenantIdA, role: 'TENANT_ADMIN' })
    })
    assert.equal(createTenantAdmin.resp.status, 200)

    const createStoreAdmin = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId, tenantId: tenantIdA, role: 'STORE_ADMIN', storeId: storeA1 })
    })
    assert.equal(createStoreAdmin.resp.status, 200)

    const listBySuper = await jsonFetch(`${ctx.base}/api/v1/admin/scopes?userId=${encodeURIComponent(targetUserId)}`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(listBySuper.resp.status, 200)
    assert.ok(listBySuper.json.data.list.some((s) => s.role === 'TENANT_ADMIN'))
    assert.ok(listBySuper.json.data.list.some((s) => s.role === 'STORE_ADMIN'))

    const tenantAdminUserId = `ta_${Date.now()}`
    const tenantAdminToken = await getDevToken(ctx.base, 'ADMIN', tenantAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: tenantAdminUserId,
        tenantId: tenantIdA,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const allowTenantAdminRole = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantIdA), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId: tenantIdA, role: 'TENANT_ADMIN' })
    })
    assert.equal(allowTenantAdminRole.resp.status, 200)

    const forbidSuperAdminRole = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantIdA), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId: tenantIdA, role: 'SUPER_ADMIN' })
    })
    assert.equal(forbidSuperAdminRole.resp.status, 403)

    const forbidTenant = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantIdA), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId: tenantIdB, role: 'STORE_ADMIN', storeId: storeA1 })
    })
    assert.equal(forbidTenant.resp.status, 403)

    const missingStore = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantIdA), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId: tenantIdA, role: 'STORE_ADMIN', storeId: storeB1 })
    })
    assert.equal(missingStore.resp.status, 404)

    const storeAdminTargetId = `su_${Date.now()}`
    const okCreate = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantIdA), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: storeAdminTargetId, tenantId: tenantIdA, role: 'STORE_ADMIN', storeId: storeA1 })
    })
    assert.equal(okCreate.resp.status, 200)
    const createdScopeId = okCreate.json.data.scopeId
    assert.ok(createdScopeId)

    const listByTenantAdmin = await jsonFetch(
      `${ctx.base}/api/v1/admin/scopes?userId=${encodeURIComponent(storeAdminTargetId)}`,
      {
        headers: tenantAdminAuthz(tenantAdminToken, tenantIdA)
      }
    )
    assert.equal(listByTenantAdmin.resp.status, 200)
    assert.equal(listByTenantAdmin.json.data.list.length, 1)
    assert.equal(listByTenantAdmin.json.data.list[0].role, 'STORE_ADMIN')

    const delOk = await jsonFetch(`${ctx.base}/api/v1/admin/scopes/${encodeURIComponent(createdScopeId)}`, {
      method: 'DELETE',
      headers: tenantAdminAuthz(tenantAdminToken, tenantIdA)
    })
    assert.equal(delOk.resp.status, 200)

    const listAfterDel = await jsonFetch(
      `${ctx.base}/api/v1/admin/scopes?userId=${encodeURIComponent(storeAdminTargetId)}`,
      {
        headers: tenantAdminAuthz(tenantAdminToken, tenantIdA)
      }
    )
    assert.equal(listAfterDel.resp.status, 200)
    assert.equal(listAfterDel.json.data.list.length, 0)

    const storeAdminActorId = `sa_${Date.now()}`
    const storeAdminToken = await getDevToken(ctx.base, 'ADMIN', storeAdminActorId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storeAdminActorId,
        tenantId: tenantIdA,
        storeId: storeA1,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )
    const forbidStoreAdmin = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(storeAdminToken, tenantIdA, storeA1), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId: tenantIdA, role: 'STORE_ADMIN', storeId: storeA1 })
    })
    assert.equal(forbidStoreAdmin.resp.status, 200)
  })
})
