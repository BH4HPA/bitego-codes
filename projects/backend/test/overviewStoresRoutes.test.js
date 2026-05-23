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

test('overview stores: platform and tenant endpoints return occupancy counts with guards', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store
    const Table = require('../dist/entities/Table').Table

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
    const storeIdA1 = `s_${Date.now()}_a1`
    const storeIdA2 = `s_${Date.now()}_a2`
    const storeIdB1 = `s_${Date.now()}_b1`
    await storeRepo.save(
      storeRepo.create({
        storeId: storeIdA1,
        tenantId: tenantIdA,
        isPrimary: 1,
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
        storeId: storeIdA2,
        tenantId: tenantIdA,
        isPrimary: 0,
        subName: 'A2',
        name: 'A2',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: storeIdB1,
        tenantId: tenantIdB,
        isPrimary: 1,
        subName: null,
        name: 'B1',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const tableRepo = ctx.AppDataSource.getRepository(Table)
    await tableRepo.save(
      tableRepo.create({ tableId: `tbl_${Date.now()}_1`, storeId: storeIdA1, code: 'A01', status: 'OCCUPIED' })
    )
    await tableRepo.save(
      tableRepo.create({ tableId: `tbl_${Date.now()}_2`, storeId: storeIdA1, code: 'A02', status: 'FREE' })
    )
    await tableRepo.save(
      tableRepo.create({ tableId: `tbl_${Date.now()}_3`, storeId: storeIdA2, code: 'A21', status: 'OCCUPIED' })
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

    const platformAll = await jsonFetch(`${ctx.base}/api/v1/platform/overview/stores?page=1&pageSize=50`, {
      headers: platformAdminAuthz(superToken)
    })
    assert.equal(platformAll.resp.status, 200)
    assert.ok(platformAll.json.data.list.some((s) => s.storeId === storeIdA1))
    assert.ok(platformAll.json.data.list.some((s) => s.storeId === storeIdA2))
    assert.ok(platformAll.json.data.list.some((s) => s.storeId === storeIdB1))

    const a1 = platformAll.json.data.list.find((s) => s.storeId === storeIdA1)
    assert.equal(a1.totalTableCount, 2)
    assert.equal(a1.occupiedTableCount, 1)
    assert.equal(a1.tenantType, 'CHAIN')
    assert.equal(a1.storeType, 'CHAIN_PRIMARY')

    const a2FromPlatform = platformAll.json.data.list.find((s) => s.storeId === storeIdA2)
    assert.equal(a2FromPlatform.tenantType, 'CHAIN')
    assert.equal(a2FromPlatform.storeType, 'CHAIN_BRANCH')

    const platformA = await jsonFetch(
      `${ctx.base}/api/v1/platform/overview/stores?tenantId=${encodeURIComponent(tenantIdA)}&page=1&pageSize=50`,
      { headers: platformAdminAuthz(superToken) }
    )
    assert.equal(platformA.resp.status, 200)
    assert.equal(platformA.json.data.list.length, 2)

    const storeAdminUserId = `sa_${Date.now()}`
    const storeAdminToken = await getDevToken(ctx.base, 'ADMIN', storeAdminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: storeAdminUserId,
        tenantId: tenantIdA,
        storeId: storeIdA1,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )
    const forbidPlatform = await jsonFetch(`${ctx.base}/api/v1/platform/overview/stores?page=1&pageSize=1`, {
      headers: storeAdminAuthz(storeAdminToken, tenantIdA, storeIdA1)
    })
    assert.equal(forbidPlatform.resp.status, 403)

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

    const tenantA = await jsonFetch(`${ctx.base}/api/v1/tenant/overview/stores?page=1&pageSize=50`, {
      headers: tenantAdminAuthz(tenantAdminToken, tenantIdA)
    })
    assert.equal(tenantA.resp.status, 200)
    assert.equal(tenantA.json.data.list.length, 2)
    const a2 = tenantA.json.data.list.find((s) => s.storeId === storeIdA2)
    assert.equal(a2.totalTableCount, 1)
    assert.equal(a2.occupiedTableCount, 1)

    const forbidTenant = await jsonFetch(`${ctx.base}/api/v1/tenant/overview/stores?page=1&pageSize=50`, {
      headers: storeAdminAuthz(storeAdminToken, tenantIdA, storeIdA1)
    })
    assert.equal(forbidTenant.resp.status, 403)
  })
})
