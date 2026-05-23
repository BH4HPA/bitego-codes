const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('stores/current supports read and update via admin context', async () => {
  await withServer(async (ctx) => {
    const Tenant = require('../dist/entities/Tenant').Tenant
    const Store = require('../dist/entities/Store').Store

    const tenantId = `t_current_${Date.now()}`
    const storeId = `store_current_${Date.now()}`

    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'SINGLE',
        brandName: 'B',
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
        name: 'S',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const created = await jsonFetch(`${ctx.base}/api/v1/stores/current?storeId=${encodeURIComponent(storeId)}`)
    assert.equal(created.resp.status, 200)
    assert.equal(created.json.data.storeId, storeId)
    assert.equal(created.json.data.tenantId, tenantId)

    const headerWins = await jsonFetch(`${ctx.base}/api/v1/stores/current?storeId=ignored`, {
      headers: { 'x-store-id': storeId }
    })
    assert.equal(headerWins.resp.status, 200)
    assert.equal(headerWins.json.data.storeId, storeId)

    const token = await getDevToken(ctx.base, 'ADMIN')
    const updated = await jsonFetch(`${ctx.base}/api/v1/stores/current`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(token, tenantId, storeId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'N1', phone: '13800138000', address: 'Addr', description: 'Desc' })
    })
    assert.equal(updated.resp.status, 200)

    const after = await jsonFetch(`${ctx.base}/api/v1/stores/current?storeId=${encodeURIComponent(storeId)}`)
    assert.equal(after.resp.status, 200)
    assert.equal(after.json.data.name, 'N1')
    assert.equal(after.json.data.phone, '13800138000')
  })
})
