const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch, getDevToken, loginAdmin, bearerAuthz, customerAuthz } = require('./testUtils')

test('admin users routes: list/create/delete/change password', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  let origEnvPwd
  await withServer(
    async ({ base, AppDataSource }) => {
      origEnvPwd = process.env.ADMIN_PASSWORD
      const badAuth = await jsonFetch(`${base}/api/v1/admin/users?page=1&pageSize=1`, {
        headers: { authorization: 'Bearer invalid.token.value' }
      })
      assert.equal(badAuth.resp.status, 401)

      const { resp: badLogin1 } = await loginAdmin(base, '', '')
      assert.equal(badLogin1.status, 400)

      const { resp: badLogin2 } = await loginAdmin(base, 'admin', 'wrong')
      assert.equal(badLogin2.status, 401)

      const { resp: okLogin, json: okLoginJson } = await loginAdmin(
        base,
        process.env.ADMIN_USERNAME,
        process.env.ADMIN_PASSWORD
      )
      assert.equal(okLogin.status, 200)
      const adminToken = okLoginJson.data.token
      assert.ok(adminToken)

      const meResp = await jsonFetch(`${base}/api/v1/users/me`, { headers: bearerAuthz(adminToken) })
      assert.equal(meResp.resp.status, 200)
      const adminUserId = meResp.json.data.userId
      assert.ok(adminUserId)
      const AdminScope = require('../dist/entities/AdminScope').AdminScope
      const scopeRepo = AppDataSource.getRepository(AdminScope)
      await scopeRepo.save(
        scopeRepo.create({
          scopeId: `sc_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          userId: adminUserId,
          tenantId: 'store_default',
          storeId: null,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE'
        })
      )

      const list1 = await jsonFetch(`${base}/api/v1/admin/users?userType=ADMIN&page=1&pageSize=10`, {
        headers: bearerAuthz(adminToken)
      })
      assert.equal(list1.resp.status, 200)
      assert.ok(Array.isArray(list1.json.data.list))

      const created = await jsonFetch(`${base}/api/v1/admin/users`, {
        method: 'POST',
        headers: { ...bearerAuthz(adminToken), 'content-type': 'application/json' },
        body: JSON.stringify({ username: `admin_${suffix}`, password: '123456', nickname: 'N', avatarUrl: '' })
      })
      assert.equal(created.resp.status, 200)
      assert.equal(created.json.success, true)
      const createdUserId = created.json.data.userId
      assert.ok(createdUserId)

      const dup = await jsonFetch(`${base}/api/v1/admin/users`, {
        method: 'POST',
        headers: { ...bearerAuthz(adminToken), 'content-type': 'application/json' },
        body: JSON.stringify({ username: `admin_${suffix}`, password: '123456' })
      })
      assert.equal(dup.resp.status, 400)

      const delSelf = await jsonFetch(`${base}/api/v1/admin/users/${encodeURIComponent(adminUserId)}`, {
        method: 'DELETE',
        headers: bearerAuthz(adminToken)
      })
      assert.equal(delSelf.resp.status, 400)

      const customerToken = await getDevToken(base, 'CUSTOMER', `usr_${suffix}`)
      const customerMe = await jsonFetch(`${base}/api/v1/users/me`, {
        headers: customerAuthz(customerToken)
      })
      assert.equal(customerMe.resp.status, 200)
      const customerUserId = customerMe.json.data.userId
      assert.ok(customerUserId)

      const customerList = await jsonFetch(`${base}/api/v1/admin/users?page=1&pageSize=1`, {
        headers: customerAuthz(customerToken)
      })
      assert.equal(customerList.resp.status, 403)

      const delCustomer = await jsonFetch(`${base}/api/v1/admin/users/${encodeURIComponent(customerUserId)}`, {
        method: 'DELETE',
        headers: bearerAuthz(adminToken)
      })
      assert.equal(delCustomer.resp.status, 400)

      const delOther = await jsonFetch(`${base}/api/v1/admin/users/${encodeURIComponent(createdUserId)}`, {
        method: 'DELETE',
        headers: bearerAuthz(adminToken)
      })
      assert.equal(delOther.resp.status, 200)
      assert.equal(delOther.json.data.userId, createdUserId)

      const delMissing = await jsonFetch(`${base}/api/v1/admin/users/${encodeURIComponent(createdUserId)}`, {
        method: 'DELETE',
        headers: bearerAuthz(adminToken)
      })
      assert.equal(delMissing.resp.status, 404)

      const badPwd = await jsonFetch(`${base}/api/v1/admin/me/password`, {
        method: 'PUT',
        headers: { ...bearerAuthz(adminToken), 'content-type': 'application/json' },
        body: JSON.stringify({ oldPassword: '', newPassword: '123' })
      })
      assert.equal(badPwd.resp.status, 400)

      const wrongOld = await jsonFetch(`${base}/api/v1/admin/me/password`, {
        method: 'PUT',
        headers: { ...bearerAuthz(adminToken), 'content-type': 'application/json' },
        body: JSON.stringify({ oldPassword: 'wrong', newPassword: 'newpass1' })
      })
      assert.equal(wrongOld.resp.status, 400)

      const okPwd = await jsonFetch(`${base}/api/v1/admin/me/password`, {
        method: 'PUT',
        headers: { ...bearerAuthz(adminToken), 'content-type': 'application/json' },
        body: JSON.stringify({ oldPassword: process.env.ADMIN_PASSWORD, newPassword: 'newpass1' })
      })
      assert.equal(okPwd.resp.status, 200)

      process.env.ADMIN_PASSWORD = 'env_disabled_for_test'

      const { resp: oldLoginAgain } = await loginAdmin(base, process.env.ADMIN_USERNAME, origEnvPwd)
      assert.equal(oldLoginAgain.status, 401)

      const { resp: newLogin, json: newLoginJson } = await loginAdmin(base, process.env.ADMIN_USERNAME, 'newpass1')
      assert.equal(newLogin.status, 200)
      assert.ok(newLoginJson.data.token)
    },
    null,
    async (ctx) => {
      if (typeof origEnvPwd !== 'undefined') process.env.ADMIN_PASSWORD = origEnvPwd
      // Clear the bootstrap admin's password hash so later tests re-seed via env defaults.
      // Without this, the changed password leaks across tests and breaks every subsequent
      // `admin/admin` login (the old code hid this by silently resetting on every such login).
      try {
        const { User } = require('../dist/entities/User')
        const userRepo = ctx.AppDataSource.getRepository(User)
        await userRepo.update({ userId: 'admin_1' }, { passwordHash: null })
      } catch {}
    }
  )
})
