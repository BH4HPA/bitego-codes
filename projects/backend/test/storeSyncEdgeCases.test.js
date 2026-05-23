const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('tenant sync endpoint guards and worker failure path', async () => {
  await withServer(async (ctx) => {
    const Store = require('../dist/entities/Store').Store
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const StoreSyncJob = require('../dist/entities/StoreSyncJob').StoreSyncJob
    const Notification = require('../dist/entities/Notification').Notification
    const { runStoreSyncWorkerOnce } = require('../dist/workers/storeSyncWorker')

    const tenantId = `t_${Date.now()}`
    const s1 = `s1_${Date.now()}`
    const s2 = `s2_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: s1,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'S1',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: s2,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'S2',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const userId = `u_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId: s2,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r1 = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, s2), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(r1.resp.status, 403)

    const tenantAdminId = `ta_${Date.now()}`
    const tenantAdminToken = await getDevToken(ctx.base, 'ADMIN', tenantAdminId)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}_2`,
        userId: tenantAdminId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r2 = await jsonFetch(`${ctx.base}/api/v1/tenant/sync-shared-catalog`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(tenantAdminToken, tenantId, s1), 'content-type': 'application/json' },
      body: '{}'
    })
    assert.equal(r2.resp.status, 403)

    const jobRepo = ctx.AppDataSource.getRepository(StoreSyncJob)
    const badJobId = `job_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    await jobRepo.save(
      jobRepo.create({
        jobId: badJobId,
        tenantId,
        sourceStoreId: s2,
        targetStoreId: s1,
        kind: 'UNKNOWN_KIND',
        status: 'PENDING',
        payload: { batchId: `b_${Date.now()}`, tenantId, sourceStoreId: s2, targetStoreId: s1 },
        errorMessage: null,
        startedAt: null,
        finishedAt: null
      })
    )
    await runStoreSyncWorkerOnce()
    const failed = await jobRepo.findOne({ where: { jobId: badJobId } })
    assert.ok(failed)
    assert.equal(failed.status, 'FAILED')

    const ntfRepo = ctx.AppDataSource.getRepository(Notification)
    const n = await ntfRepo.find({ where: { type: 'STORE_SYNC_FAILED', storeId: s1 } })
    assert.equal(n.length, 1)
  })
})

test('admin notifications are scoped by store context for STORE_ADMIN', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Notification = require('../dist/entities/Notification').Notification
    const Store = require('../dist/entities/Store').Store

    const tenantId = `t_${Date.now()}`
    const storeId = `s_${Date.now()}`
    const otherStoreId = `s_${Date.now()}_o`

    const userId = `u_${Date.now()}`
    const token = await getDevToken(ctx.base, 'ADMIN', userId)
    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${Date.now()}`,
        userId,
        tenantId,
        storeId,
        role: 'STORE_ADMIN',
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
    await storeRepo.save(
      storeRepo.create({
        storeId: otherStoreId,
        tenantId,
        isPrimary: 0,
        subName: null,
        name: 'O',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const repo = ctx.AppDataSource.getRepository(Notification)
    const n1Id = `ntf_${Date.now()}_1`
    const n2Id = `ntf_${Date.now()}_2`
    await repo.save(
      repo.create({
        notificationId: n1Id,
        type: 'X',
        title: 'A',
        message: 'A',
        orderId: null,
        tableId: null,
        tableCode: null,
        tenantId,
        storeId,
        status: 'UNREAD',
        readAt: null,
        handledAt: null,
        payload: null
      })
    )
    await repo.save(
      repo.create({
        notificationId: n2Id,
        type: 'X',
        title: 'B',
        message: 'B',
        orderId: null,
        tableId: null,
        tableCode: null,
        tenantId,
        storeId: otherStoreId,
        status: 'UNREAD',
        readAt: null,
        handledAt: null,
        payload: null
      })
    )

    const { resp, json } = await jsonFetch(`${ctx.base}/api/v1/admin/notifications?page=1&pageSize=50`, {
      headers: storeAdminAuthz(token, tenantId, storeId)
    })
    assert.equal(resp.status, 200)
    const ids = (json.data.list || []).map((x) => x.notificationId)
    assert.ok(ids.includes(n2Id) === false)
    assert.ok(ids.includes(n1Id) === true)
    assert.equal((json.data.list || []).filter((x) => x.storeId === otherStoreId).length, 0)
    assert.equal((json.data.list || []).filter((x) => x.storeId === storeId).length, 1)
  })
})
