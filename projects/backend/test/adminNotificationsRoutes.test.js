const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch, getDevToken, loginAdmin, bearerAuthz, customerAuthz } = require('./testUtils')

test('admin notifications routes: list/read/handled', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base, AppDataSource }) => {
    const noAuth = await jsonFetch(`${base}/api/v1/admin/notifications?page=1&pageSize=10`)
    assert.equal(noAuth.resp.status, 401)

    const noAuthReadAll = await jsonFetch(`${base}/api/v1/admin/notifications/read-all`, { method: 'PUT' })
    assert.equal(noAuthReadAll.resp.status, 401)

    const { resp: okLogin, json: okLoginJson } = await loginAdmin(
      base,
      process.env.ADMIN_USERNAME,
      process.env.ADMIN_PASSWORD
    )
    assert.equal(okLogin.status, 200)
    const adminToken = okLoginJson.data.token
    assert.ok(adminToken)

    const customerToken = await getDevToken(base, 'CUSTOMER', `usr_notif_${suffix}`)
    const forbidden = await jsonFetch(`${base}/api/v1/admin/notifications?page=1&pageSize=10`, {
      headers: customerAuthz(customerToken)
    })
    assert.equal(forbidden.resp.status, 403)

    const forbiddenReadAll = await jsonFetch(`${base}/api/v1/admin/notifications/read-all`, {
      method: 'PUT',
      headers: customerAuthz(customerToken)
    })
    assert.equal(forbiddenReadAll.resp.status, 403)

    const { Notification } = require('../dist/entities/Notification')
    const repo = AppDataSource.getRepository(Notification)
    const n1 = repo.create({
      notificationId: `n_unread_${suffix}`,
      type: 'ORDER_CREATED',
      title: 't1',
      message: 'm1',
      orderId: null,
      tableId: null,
      tableCode: 'A01',
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    const n2 = repo.create({
      notificationId: `n_read_${suffix}`,
      type: 'REFUND_REQUESTED',
      title: 't2',
      message: 'm2',
      orderId: null,
      tableId: null,
      tableCode: 'A02',
      status: 'READ',
      readAt: new Date(),
      handledAt: null,
      payload: null
    })
    await repo.save([n1, n2])

    const readMissing = await jsonFetch(`${base}/api/v1/admin/notifications/not_found_${suffix}/read`, {
      method: 'PUT',
      headers: bearerAuthz(adminToken)
    })
    assert.equal(readMissing.resp.status, 404)

    const readOnce = await jsonFetch(
      `${base}/api/v1/admin/notifications/${encodeURIComponent(n1.notificationId)}/read`,
      {
        method: 'PUT',
        headers: bearerAuthz(adminToken)
      }
    )
    assert.equal(readOnce.resp.status, 200)
    assert.equal(readOnce.json.data.status, 'READ')

    const readTwice = await jsonFetch(
      `${base}/api/v1/admin/notifications/${encodeURIComponent(n1.notificationId)}/read`,
      {
        method: 'PUT',
        headers: bearerAuthz(adminToken)
      }
    )
    assert.equal(readTwice.resp.status, 200)
    assert.equal(readTwice.json.data.status, 'READ')

    const nAll = repo.create({
      notificationId: `n_all_${suffix}`,
      type: 'ORDER_CREATED',
      title: 't_all',
      message: 'm_all',
      orderId: null,
      tableId: null,
      tableCode: 'A01',
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    await repo.save(nAll)

    const readAll = await jsonFetch(`${base}/api/v1/admin/notifications/read-all`, {
      method: 'PUT',
      headers: bearerAuthz(adminToken)
    })
    assert.equal(readAll.resp.status, 200)
    assert.ok(readAll.json.data.updated >= 1)
    const nAllAfter = await repo.findOne({ where: { notificationId: nAll.notificationId } })
    assert.equal(nAllAfter.status, 'READ')
    assert.ok(nAllAfter.readAt)

    const listAll = await jsonFetch(`${base}/api/v1/admin/notifications?page=1&pageSize=50`, {
      headers: bearerAuthz(adminToken)
    })
    assert.equal(listAll.resp.status, 200)
    assert.ok(listAll.json.data.list.some((x) => x.notificationId === n1.notificationId))
    assert.ok(listAll.json.data.list.some((x) => x.notificationId === n2.notificationId))

    const listUnread = await jsonFetch(`${base}/api/v1/admin/notifications?status=UNREAD&page=1&pageSize=50`, {
      headers: bearerAuthz(adminToken)
    })
    assert.equal(listUnread.resp.status, 200)
    assert.ok(listUnread.json.data.list.every((x) => x.status === 'UNREAD'))

    const handledMissing = await jsonFetch(`${base}/api/v1/admin/notifications/not_found_${suffix}/handled`, {
      method: 'PUT',
      headers: bearerAuthz(adminToken)
    })
    assert.equal(handledMissing.resp.status, 404)

    const n3 = repo.create({
      notificationId: `n_handle_${suffix}`,
      type: 'ORDER_CREATED',
      title: 't3',
      message: 'm3',
      orderId: null,
      tableId: null,
      tableCode: 'A03',
      status: 'UNREAD',
      readAt: null,
      handledAt: null,
      payload: null
    })
    await repo.save(n3)
    const handled = await jsonFetch(
      `${base}/api/v1/admin/notifications/${encodeURIComponent(n3.notificationId)}/handled`,
      {
        method: 'PUT',
        headers: bearerAuthz(adminToken)
      }
    )
    assert.equal(handled.resp.status, 200)
    assert.equal(handled.json.data.status, 'HANDLED')
    const n3After = await repo.findOne({ where: { notificationId: n3.notificationId } })
    assert.equal(n3After.status, 'HANDLED')
    assert.ok(n3After.readAt)
    assert.ok(n3After.handledAt)
  })
})
