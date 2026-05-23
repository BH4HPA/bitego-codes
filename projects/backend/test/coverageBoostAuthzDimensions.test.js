const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, bearerAuthz, platformAdminAuthz, tenantAdminAuthz } = require('./testUtils')

test('authz dimensions: me scopes groups and platform branding permission', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantId = `t_${Date.now()}_dim`
    const storePrimaryId = `s_${Date.now()}_p`
    const storeChildId = `s_${Date.now()}_c`

    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'T',
        brandLogoUrl: null,
        primaryStoreId: storePrimaryId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: storePrimaryId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'P',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: storeChildId,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'C',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)

    const storeOnlyUserId = `u_${Date.now()}_storeonly`
    const storeOnlyToken = await getDevToken(ctx.base, 'ADMIN', storeOnlyUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storeOnlyUserId,
        tenantId,
        storeId: storeChildId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const meStoreOnly = await jsonFetch(`${ctx.base}/api/v1/admin/me/scopes`, {
      headers: bearerAuthz(storeOnlyToken)
    })
    assert.equal(meStoreOnly.resp.status, 200)
    assert.equal(meStoreOnly.json.data.platform, null)
    assert.equal(meStoreOnly.json.data.tenants.length, 1)
    assert.equal(meStoreOnly.json.data.tenants[0].tenantId, tenantId)
    assert.equal(meStoreOnly.json.data.tenants[0].effectiveRole, 'STORE_ADMIN')
    assert.equal(meStoreOnly.json.data.tenants[0].stores.length, 1)
    assert.equal(meStoreOnly.json.data.tenants[0].stores[0].storeId, storeChildId)
    // STORE_ADMIN on a CHAIN branch should NOT be able to manage shared catalog.
    assert.equal(meStoreOnly.json.data.tenants[0].stores[0].canManageSharedCatalog, false)

    const storePrimaryUserId = `u_${Date.now()}_storep`
    const storePrimaryToken = await getDevToken(ctx.base, 'ADMIN', storePrimaryUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storePrimaryUserId,
        tenantId,
        storeId: storePrimaryId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const mePrimary = await jsonFetch(`${ctx.base}/api/v1/admin/me/scopes`, {
      headers: bearerAuthz(storePrimaryToken)
    })
    assert.equal(mePrimary.resp.status, 200)
    const primaryScope = mePrimary.json.data.list.find((s) => s.role === 'STORE_ADMIN' && s.storeId === storePrimaryId)
    assert.ok(primaryScope)
    // STORE_ADMIN on the CHAIN primary store is allowed to manage shared catalog.
    assert.equal(primaryScope.canManageSharedCatalog, true)

    const superUserId = `u_${Date.now()}_superb`
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

    const putBranding = await jsonFetch(`${ctx.base}/api/v1/platform/branding`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ platformName: 'BiteGo X', platformLogoUrl: null })
    })
    assert.equal(putBranding.resp.status, 200)

    const tenantAdminUserId = `u_${Date.now()}_ta`
    const tenantAdminToken = await getDevToken(ctx.base, 'ADMIN', tenantAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: tenantAdminUserId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    const meTenantAdmin = await jsonFetch(`${ctx.base}/api/v1/admin/me/scopes`, {
      headers: bearerAuthz(tenantAdminToken)
    })
    assert.equal(meTenantAdmin.resp.status, 200)
    const dimTenant = meTenantAdmin.json.data.tenants.find((t) => t.tenantId === tenantId)
    assert.ok(dimTenant)
    assert.equal(dimTenant.effectiveRole, 'TENANT_ADMIN')
    assert.ok(dimTenant.stores.some((s) => s.storeId === storePrimaryId))
    assert.ok(dimTenant.stores.some((s) => s.storeId === storeChildId))
    // TENANT_ADMIN on a CHAIN branch store context must not hold canManageSharedCatalog — the
    // good row is keyed by storeId, so a write there would diverge from the primary copy.
    const dimPrimary = dimTenant.stores.find((s) => s.storeId === storePrimaryId)
    const dimChild = dimTenant.stores.find((s) => s.storeId === storeChildId)
    assert.equal(dimPrimary.canManageSharedCatalog, true)
    assert.equal(dimChild.canManageSharedCatalog, false)

    const forbidBranding = await jsonFetch(`${ctx.base}/api/v1/platform/branding`, {
      method: 'PUT',
      headers: { ...platformAdminAuthz(tenantAdminToken), 'content-type': 'application/json' },
      body: JSON.stringify({ platformName: 'BiteGo Y' })
    })
    // Tenant admin addressing the platform board is rejected at context resolution.
    assert.ok([400, 403].includes(forbidBranding.resp.status))
  })
})

test('authz dimensions: peer-role scope grant and revoke are allowed', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)

    const superUserId = `u_${Date.now()}_peer_super`
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

    // A super admin may grant another account the SUPER_ADMIN role (peer grant).
    const peerSuperUserId = `u_${Date.now()}_peer_super2`
    await getDevToken(ctx.base, 'ADMIN', peerSuperUserId)
    const grantPeer = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...platformAdminAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: peerSuperUserId, tenantId: 'store_default', role: 'SUPER_ADMIN' })
    })
    assert.equal(grantPeer.resp.status, 200)
    const peerScopeId = grantPeer.json.data.scopeId
    assert.ok(peerScopeId)

    // A super admin may also revoke another SUPER_ADMIN scope.
    const revokePeer = await jsonFetch(`${ctx.base}/api/v1/admin/scopes/${peerScopeId}`, {
      method: 'DELETE',
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(revokePeer.resp.status, 200)

    // A tenant admin may grant another account TENANT_ADMIN in their own tenant (peer grant).
    const tenantId = `t_${Date.now()}_peer`
    const storePrimaryId = `s_${Date.now()}_peer_p`
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'SINGLE',
        brandName: 'T',
        brandLogoUrl: null,
        primaryStoreId: storePrimaryId,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: storePrimaryId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'P',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const tenantAdminUserId = `u_${Date.now()}_peer_ta`
    const tenantAdminToken = await getDevToken(ctx.base, 'ADMIN', tenantAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: tenantAdminUserId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const peerTenantAdminId = `u_${Date.now()}_peer_ta2`
    await getDevToken(ctx.base, 'ADMIN', peerTenantAdminId)
    const grantPeerTenant = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: peerTenantAdminId, tenantId, role: 'TENANT_ADMIN' })
    })
    assert.equal(grantPeerTenant.resp.status, 200)

    // But a tenant admin still cannot grant SUPER_ADMIN (strictly above their rank).
    const forbidElevation = await jsonFetch(`${ctx.base}/api/v1/admin/scopes`, {
      method: 'POST',
      headers: { ...tenantAdminAuthz(tenantAdminToken, tenantId), 'content-type': 'application/json' },
      body: JSON.stringify({ userId: peerTenantAdminId, tenantId: 'store_default', role: 'SUPER_ADMIN' })
    })
    assert.equal(forbidElevation.resp.status, 403)
  })
})
