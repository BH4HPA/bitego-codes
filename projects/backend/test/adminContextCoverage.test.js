const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('adminContext coverage: resolves scopes and headers', async () => {
  await withServer(async (ctx) => {
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store
    const AdminScope = require('../dist/entities/AdminScope').AdminScope

    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)

    const tenantId = `t_${Date.now()}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'Brand',
        brandLogoUrl: null,
        primaryStoreId: null,
        status: 'ACTIVE'
      })
    )

    const storeA = `sA_${Date.now()}`
    const storeB = `sB_${Date.now()}`
    const storeOther = `sO_${Date.now()}`
    await storeRepo.save(
      storeRepo.create({
        storeId: storeA,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'A',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: storeB,
        tenantId,
        isPrimary: 0,
        subName: 'B',
        name: 'B',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: storeOther,
        tenantId: `other_${Date.now()}`,
        isPrimary: 1,
        subName: null,
        name: 'O',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const adminUserId = `admin_${Date.now()}`
    const adminToken = await getDevToken(ctx.base, 'ADMIN', adminUserId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId: adminUserId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r1 = await jsonFetch(`${ctx.base}/api/v1/tables?page=1&pageSize=1`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeB)
    })
    assert.equal(r1.resp.status, 200)

    const r2 = await jsonFetch(`${ctx.base}/api/v1/tables?page=1&pageSize=1`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeOther)
    })
    assert.equal(r2.resp.status, 403)

    const r3 = await jsonFetch(`${ctx.base}/api/v1/tables?page=1&pageSize=1`, {
      headers: storeAdminAuthz(adminToken, tenantId, `missing_${Date.now()}`)
    })
    assert.equal(r3.resp.status, 404)

    globalThis.__COS_PUT_OBJECT__ = async () => ({ Location: 'mock' })
    const r4 = await jsonFetch(`${ctx.base}/api/v1/stores/export`, {
      headers: storeAdminAuthz(adminToken, tenantId, storeA)
    })
    delete globalThis.__COS_PUT_OBJECT__
    assert.equal(r4.resp.status, 200)

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
    globalThis.__COS_PUT_OBJECT__ = async () => ({ Location: 'mock' })
    const r5 = await jsonFetch(`${ctx.base}/api/v1/stores/export`, {
      headers: storeAdminAuthz(superToken, tenantId, storeA)
    })
    delete globalThis.__COS_PUT_OBJECT__
    assert.equal(r5.resp.status, 200)
  })
})
