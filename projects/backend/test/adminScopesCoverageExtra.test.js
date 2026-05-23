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

test('admin scopes: cover validation and forbidden branches', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantId = `t_${Date.now()}`
    const storeId = `s_${Date.now()}`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'T',
        brandLogoUrl: null,
        primaryStoreId: null,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'S',
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

    const storeAdminActorId = `sa_${Date.now()}`
    const storeAdminToken = await getDevToken(ctx.base, 'ADMIN', storeAdminActorId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storeAdminActorId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r0 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      headers: bearerAuthz(superToken)
    })
    assert.equal(r0.resp.status, 400)

    const r1 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes?userId=${encodeURIComponent(storeAdminActorId)}`, {
      headers: storeAdminAuthz(storeAdminToken, tenantId, storeId)
    })
    assert.equal(r1.resp.status, 403)

    const r2 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, role: 'TENANT_ADMIN' })
    })
    assert.equal(r2.resp.status, 400)

    const r3 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId, role: 'TENANT_ADMIN', status: 'INACTIVE' })
    })
    assert.equal(r3.resp.status, 400)

    const r4 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId, role: 'SUPER_ADMIN', storeId })
    })
    assert.equal(r4.resp.status, 400)

    const r5 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId, role: 'TENANT_ADMIN', storeId })
    })
    assert.equal(r5.resp.status, 400)

    const r6 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId: `t_missing_${Date.now()}`, role: 'TENANT_ADMIN' })
    })
    assert.equal(r6.resp.status, 404)

    const r7 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `u_${Date.now()}`, tenantId, role: 'STORE_ADMIN' })
    })
    assert.equal(r7.resp.status, 400)

    const dupUserId = `dup_${Date.now()}`
    const r8 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: dupUserId, tenantId, role: 'STORE_ADMIN', storeId })
    })
    assert.equal(r8.resp.status, 200)
    const r9 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: dupUserId, tenantId, role: 'STORE_ADMIN', storeId })
    })
    assert.equal(r9.resp.status, 200)
    assert.equal(r9.json.message, 'Exists')

    const r10 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes/%20`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(r10.resp.status, 400)

    const r11 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes/sc_missing_${Date.now()}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(r11.resp.status, 404)

    const tenantAdminActorId = `ta_${Date.now()}`
    const tenantAdminToken = await getDevToken(ctx.base, 'ADMIN', tenantAdminActorId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: tenantAdminActorId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const scopeToDel = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: `tb_${Date.now()}`, tenantId, role: 'TENANT_ADMIN' })
    })
    assert.equal(scopeToDel.resp.status, 200)
    const tenantAdminScopeId = scopeToDel.json.data.scopeId
    assert.ok(tenantAdminScopeId)

    // Tenant admins cannot delete a scope that is above their role (e.g. a SUPER_ADMIN scope).
    const aboveScope = await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_above`,
        userId: `u_above_${Date.now()}`,
        tenantId: 'store_default',
        storeId: null,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      })
    )
    const r12 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes/${encodeURIComponent(aboveScope.scopeId)}`, {
      method: 'DELETE',
      headers: tenantAdminAuthz(tenantAdminToken, tenantId)
    })
    assert.equal(r12.resp.status, 403)

    // Tenant admins also cannot touch scopes belonging to other tenants.
    const otherTenantScope = await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_other`,
        userId: `u_other_${Date.now()}`,
        tenantId: `t_other_${Date.now()}`,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    const r12b = await jsonFetch(`${ctx.base}/api/v1/admin/scopes/${encodeURIComponent(otherTenantScope.scopeId)}`, {
      method: 'DELETE',
      headers: tenantAdminAuthz(tenantAdminToken, tenantId)
    })
    assert.equal(r12b.resp.status, 403)

    const r13 = await jsonFetch(`${ctx.base}/api/v1/admin/scopes/${encodeURIComponent(tenantAdminScopeId)}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(r13.resp.status, 200)
  })
})
