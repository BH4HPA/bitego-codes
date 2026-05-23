const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, loginAdmin, bearerAuthz } = require('./testUtils')

test('admin users: cover validation branches and password change', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const User = require('../dist/entities/User').User
    const { verifyPassword } = require('../dist/utils/password')

    const scopeRepo = ctx.AppDataSource.getRepository(AdminScope)
    const userRepo = ctx.AppDataSource.getRepository(User)

    const superUserId = `u_${Date.now()}_super_users`
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

    const list1 = await jsonFetch(`${ctx.base}/api/v1/admin/users?page=1&pageSize=5`, {
      headers: bearerAuthz(superToken)
    })
    assert.equal(list1.resp.status, 200)

    const list2 = await jsonFetch(
      `${ctx.base}/api/v1/admin/users?userType=ADMIN&keyword=${encodeURIComponent('admin')}&page=1&pageSize=5`,
      {
        headers: bearerAuthz(superToken)
      }
    )
    assert.equal(list2.resp.status, 200)

    const badCreate1 = await jsonFetch(`${ctx.base}/api/v1/admin/users`, {
      method: 'POST',
      headers: { ...bearerAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'u1', password: '123' })
    })
    assert.equal(badCreate1.resp.status, 400)

    const badCreate2 = await jsonFetch(`${ctx.base}/api/v1/admin/users`, {
      method: 'POST',
      headers: { ...bearerAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'u2', password: '123456', nickname: 'x'.repeat(21) })
    })
    assert.equal(badCreate2.resp.status, 400)

    const badCreate3 = await jsonFetch(`${ctx.base}/api/v1/admin/users`, {
      method: 'POST',
      headers: { ...bearerAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'u3', password: '123456', avatarUrl: 'x'.repeat(501) })
    })
    assert.equal(badCreate3.resp.status, 400)

    const usernameOk = `u_ok_${Date.now()}`
    const okCreate = await jsonFetch(`${ctx.base}/api/v1/admin/users`, {
      method: 'POST',
      headers: { ...bearerAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: usernameOk, password: '123456', nickname: 'N', avatarUrl: '' })
    })
    assert.equal(okCreate.resp.status, 200)
    const createdUserId = okCreate.json.data.userId
    assert.ok(createdUserId)

    const dupCreate = await jsonFetch(`${ctx.base}/api/v1/admin/users`, {
      method: 'POST',
      headers: { ...bearerAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ username: usernameOk, password: '123456' })
    })
    assert.equal(dupCreate.resp.status, 400)

    const checkBad = await jsonFetch(
      `${ctx.base}/api/v1/admin/users/username-available?username=${encodeURIComponent('x'.repeat(51))}`,
      {
        headers: bearerAuthz(superToken)
      }
    )
    assert.equal(checkBad.resp.status, 400)

    const checkOk = await jsonFetch(
      `${ctx.base}/api/v1/admin/users/username-available?username=${encodeURIComponent(usernameOk)}`,
      {
        headers: bearerAuthz(superToken)
      }
    )
    assert.equal(checkOk.resp.status, 200)
    assert.equal(checkOk.json.data.available, false)

    const search1 = await jsonFetch(
      `${ctx.base}/api/v1/admin/users/search?keyword=${encodeURIComponent(usernameOk)}&page=1&pageSize=10`,
      {
        headers: bearerAuthz(superToken)
      }
    )
    assert.equal(search1.resp.status, 200)

    const delSelf = await jsonFetch(`${ctx.base}/api/v1/admin/users/${encodeURIComponent(superUserId)}`, {
      method: 'DELETE',
      headers: bearerAuthz(superToken)
    })
    assert.equal(delSelf.resp.status, 400)

    const delMissing = await jsonFetch(
      `${ctx.base}/api/v1/admin/users/${encodeURIComponent(`missing_${Date.now()}`)}`,
      {
        method: 'DELETE',
        headers: bearerAuthz(superToken)
      }
    )
    assert.equal(delMissing.resp.status, 404)

    const customerId = `c_${Date.now()}`
    await userRepo.save(
      userRepo.create({
        userId: customerId,
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'C',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    const delCustomer = await jsonFetch(`${ctx.base}/api/v1/admin/users/${encodeURIComponent(customerId)}`, {
      method: 'DELETE',
      headers: bearerAuthz(superToken)
    })
    assert.equal(delCustomer.resp.status, 400)

    const delOk = await jsonFetch(`${ctx.base}/api/v1/admin/users/${encodeURIComponent(createdUserId)}`, {
      method: 'DELETE',
      headers: bearerAuthz(superToken)
    })
    assert.equal(delOk.resp.status, 200)

    const badPwd = await jsonFetch(`${ctx.base}/api/v1/admin/me/password`, {
      method: 'PUT',
      headers: { ...bearerAuthz(superToken), 'content-type': 'application/json' },
      body: JSON.stringify({ oldPassword: 'x', newPassword: '1' })
    })
    assert.equal(badPwd.resp.status, 400)

    const adminUsername = process.env.ADMIN_USERNAME || 'admin'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin'
    const login = await loginAdmin(ctx.base, adminUsername, adminPassword)
    assert.equal(login.resp.status, 200)
    const loginToken = login.json.data.token
    assert.ok(loginToken)

    const wrongOld = await jsonFetch(`${ctx.base}/api/v1/admin/me/password`, {
      method: 'PUT',
      headers: { ...bearerAuthz(loginToken), 'content-type': 'application/json' },
      body: JSON.stringify({ oldPassword: 'wrong', newPassword: 'admin123' })
    })
    assert.equal(wrongOld.resp.status, 400)

    const okPwd = await jsonFetch(`${ctx.base}/api/v1/admin/me/password`, {
      method: 'PUT',
      headers: { ...bearerAuthz(loginToken), 'content-type': 'application/json' },
      body: JSON.stringify({ oldPassword: adminPassword, newPassword: 'admin123' })
    })
    assert.equal(okPwd.resp.status, 200)

    const admin1 = await userRepo.findOne({ where: { userId: 'admin_1' } })
    assert.ok(admin1 && admin1.passwordHash)
    assert.equal(verifyPassword(adminPassword, admin1.passwordHash), false)
    assert.equal(verifyPassword('admin123', admin1.passwordHash), true)

    // Restore bootstrap admin so later tests can re-seed via env defaults.
    await userRepo.update({ userId: 'admin_1' }, { passwordHash: null })
  })
})
