const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch, loginAdmin, bearerAuthz, tenantAdminAuthz, storeAdminAuthz } = require('./testUtils')

test('admin notifications are filtered by admin context (platform/tenant/store)', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base, AppDataSource }) => {
    const { resp: okLogin, json: okLoginJson } = await loginAdmin(
      base,
      process.env.ADMIN_USERNAME,
      process.env.ADMIN_PASSWORD
    )
    assert.equal(okLogin.status, 200)
    const adminToken = okLoginJson.data.token
    assert.ok(adminToken)

    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { Notification } = require('../dist/entities/Notification')

    const tenantIdA = `t_notif_a_${suffix}`
    const tenantIdB = `t_notif_b_${suffix}`
    const storeA1 = `s_notif_a1_${suffix}`
    const storeA2 = `s_notif_a2_${suffix}`
    const storeB1 = `s_notif_b1_${suffix}`

    const tenantRepo = AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId: tenantIdA,
        type: 'CHAIN',
        brandName: 'A',
        brandLogoUrl: null,
        primaryStoreId: storeA1,
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
        primaryStoreId: storeB1,
        lastSyncedChangeId: null,
        lastSyncedAt: null,
        status: 'ACTIVE'
      })
    )

    const storeRepo = AppDataSource.getRepository(Store)
    await storeRepo.save(
      storeRepo.create({
        storeId: storeA1,
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
        storeId: storeA2,
        tenantId: tenantIdA,
        isPrimary: 0,
        subName: null,
        name: 'A2',
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
        isPrimary: 1,
        subName: null,
        name: 'B1',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const notifRepo = AppDataSource.getRepository(Notification)
    const nGlobal = notifRepo.create({
      notificationId: `n_global_${suffix}`,
      type: 'ORDER_CREATED',
      title: 'global',
      message: 'global',
      tenantId: null,
      storeId: null,
      orderId: null,
      tableId: null,
      tableCode: null,
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    const nATenant = notifRepo.create({
      notificationId: `n_tenant_a_${suffix}`,
      type: 'ORDER_CREATED',
      title: 'tenantA',
      message: 'tenantA',
      tenantId: tenantIdA,
      storeId: null,
      orderId: null,
      tableId: null,
      tableCode: null,
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    const nAStore1 = notifRepo.create({
      notificationId: `n_store_a1_${suffix}`,
      type: 'ORDER_CREATED',
      title: 'storeA1',
      message: 'storeA1',
      tenantId: tenantIdA,
      storeId: storeA1,
      orderId: null,
      tableId: null,
      tableCode: null,
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    const nAStore2 = notifRepo.create({
      notificationId: `n_store_a2_${suffix}`,
      type: 'ORDER_CREATED',
      title: 'storeA2',
      message: 'storeA2',
      tenantId: tenantIdA,
      storeId: storeA2,
      orderId: null,
      tableId: null,
      tableCode: null,
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    const nBTenant = notifRepo.create({
      notificationId: `n_tenant_b_${suffix}`,
      type: 'ORDER_CREATED',
      title: 'tenantB',
      message: 'tenantB',
      tenantId: tenantIdB,
      storeId: null,
      orderId: null,
      tableId: null,
      tableCode: null,
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    await notifRepo.save([nGlobal, nATenant, nAStore1, nAStore2, nBTenant])

    const platformList = await jsonFetch(`${base}/api/v1/admin/notifications?page=1&pageSize=50`, {
      headers: bearerAuthz(adminToken)
    })
    assert.equal(platformList.resp.status, 200)
    const platformIds = platformList.json.data.list.map((x) => x.notificationId)
    assert.ok(platformIds.includes(nGlobal.notificationId))
    assert.ok(!platformIds.includes(nATenant.notificationId))
    assert.ok(!platformIds.includes(nAStore1.notificationId))
    assert.ok(!platformIds.includes(nAStore2.notificationId))
    assert.ok(!platformIds.includes(nBTenant.notificationId))

    const tenantAList = await jsonFetch(`${base}/api/v1/admin/notifications?page=1&pageSize=50`, {
      headers: tenantAdminAuthz(adminToken, tenantIdA)
    })
    assert.equal(tenantAList.resp.status, 200)
    const tenantAIds = tenantAList.json.data.list.map((x) => x.notificationId)
    assert.ok(tenantAIds.includes(nATenant.notificationId))
    assert.ok(!tenantAIds.includes(nGlobal.notificationId))
    assert.ok(!tenantAIds.includes(nAStore1.notificationId))
    assert.ok(!tenantAIds.includes(nAStore2.notificationId))
    assert.ok(!tenantAIds.includes(nBTenant.notificationId))

    const storeA1List = await jsonFetch(`${base}/api/v1/admin/notifications?page=1&pageSize=50`, {
      headers: storeAdminAuthz(adminToken, tenantIdA, storeA1)
    })
    assert.equal(storeA1List.resp.status, 200)
    const storeA1Ids = storeA1List.json.data.list.map((x) => x.notificationId)
    assert.ok(storeA1Ids.includes(nAStore1.notificationId))
    assert.ok(!storeA1Ids.includes(nAStore2.notificationId))
    assert.ok(!storeA1Ids.includes(nBTenant.notificationId))
    assert.ok(!storeA1Ids.includes(nGlobal.notificationId))
    assert.ok(!storeA1Ids.includes(nATenant.notificationId))

    const readAllStoreA1 = await jsonFetch(`${base}/api/v1/admin/notifications/read-all`, {
      method: 'PUT',
      headers: storeAdminAuthz(adminToken, tenantIdA, storeA1)
    })
    assert.equal(readAllStoreA1.resp.status, 200)

    const afterA1 = await notifRepo.findOne({ where: { notificationId: nAStore1.notificationId } })
    const afterA2 = await notifRepo.findOne({ where: { notificationId: nAStore2.notificationId } })
    const afterB = await notifRepo.findOne({ where: { notificationId: nBTenant.notificationId } })
    assert.equal(afterA1.status, 'READ')
    assert.equal(afterA2.status, 'UNREAD')
    assert.equal(afterB.status, 'UNREAD')
  })
})
