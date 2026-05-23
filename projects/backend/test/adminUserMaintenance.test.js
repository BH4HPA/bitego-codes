const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, getDevToken, jsonFetch } = require('./testUtils')

test('admin users: profile update and reset-password authz branches', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { Tenant } = require('../dist/entities/Tenant')
    const { Store } = require('../dist/entities/Store')
    const { User } = require('../dist/entities/User')
    const { AdminScope } = require('../dist/entities/AdminScope')
    const { hashPassword, verifyPassword } = require('../dist/utils/password')

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)
    const userRepo = AppDataSource.getRepository(User)
    const scopeRepo = AppDataSource.getRepository(AdminScope)

    const stamp = Date.now()
    const tenantId = `t_maint_${stamp}`
    const storeA = `s_a_${stamp}`
    const storeB = `s_b_${stamp}`
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'T',
        brandLogoUrl: null,
        primaryStoreId: storeA,
        status: 'ACTIVE',
        lastSyncedChangeId: 0,
        lastSyncedAt: null
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: storeA,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: 'StoreA',
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
        subName: null,
        name: 'StoreB',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
    )

    const tenantAdminId = `admin_t_${stamp}`
    const storeAdminAId = `admin_sa_${stamp}`
    const storeAdminBId = `admin_sb_${stamp}`
    await userRepo.save(
      userRepo.create({
        userId: tenantAdminId,
        userType: 'ADMIN',
        username: `u_t_${stamp}`,
        passwordHash: hashPassword('p_123456'),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'TA',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    await userRepo.save(
      userRepo.create({
        userId: storeAdminAId,
        userType: 'ADMIN',
        username: `u_sa_${stamp}`,
        passwordHash: hashPassword('p_123456'),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'SA_A',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    await userRepo.save(
      userRepo.create({
        userId: storeAdminBId,
        userType: 'ADMIN',
        username: `u_sb_${stamp}`,
        passwordHash: hashPassword('p_123456'),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'SA_B',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${stamp}_t`,
        userId: tenantAdminId,
        tenantId,
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${stamp}_sa`,
        userId: storeAdminAId,
        tenantId,
        storeId: storeA,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )
    await scopeRepo.save(
      scopeRepo.create({
        scopeId: `sc_${stamp}_sb`,
        userId: storeAdminBId,
        tenantId,
        storeId: storeB,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
    )

    const authzTenant = await getAuthz(base, 'ADMIN', tenantAdminId)
    const authzStoreA = await getAuthz(base, 'ADMIN', storeAdminAId)
    const superToken = await getDevToken(base, 'ADMIN')

    const tenantHeaders = { ...authzTenant, 'x-tenant-id': tenantId, 'x-board': 'tenant' }
    const storeAHeaders = { ...authzStoreA, 'x-tenant-id': tenantId, 'x-store-id': storeA, 'x-board': 'store' }
    const superHeaders = { authorization: `Bearer ${superToken}`, 'x-board': 'platform' }

    // 1. tenant admin updates store admin within tenant
    const updOk = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'renamed', avatarUrl: 'https://x/1.png' })
    })
    assert.equal(updOk.resp.status, 200)
    assert.equal(updOk.json.data.nickname, 'renamed')
    assert.equal(updOk.json.data.avatarUrl, 'https://x/1.png')

    // 2. tenant admin cannot update store admin outside tenant -> 404
    const outsideUserId = `admin_outside_${stamp}`
    await userRepo.save(
      userRepo.create({
        userId: outsideUserId,
        userType: 'ADMIN',
        username: `u_out_${stamp}`,
        passwordHash: hashPassword('p_123456'),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'OUT',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    const updForbid = await jsonFetch(`${base}/api/v1/admin/users/${outsideUserId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'x' })
    })
    assert.equal(updForbid.resp.status, 403)

    // 3. store admin A can't touch store admin B (different store)
    const updCrossStore = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminBId}/profile`, {
      method: 'PUT',
      headers: { ...storeAHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'x' })
    })
    assert.equal(updCrossStore.resp.status, 403)

    // 4. self edit forbidden
    const updSelf = await jsonFetch(`${base}/api/v1/admin/users/${tenantAdminId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'self' })
    })
    assert.equal(updSelf.resp.status, 400)

    // 5. empty body -> 400
    const updEmpty = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({})
    })
    assert.equal(updEmpty.resp.status, 400)

    // 6. nickname too long -> 400
    const updBadNick = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'x'.repeat(50) })
    })
    assert.equal(updBadNick.resp.status, 400)

    // 7. avatarUrl too long -> 400
    const updBadAvatar = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ avatarUrl: 'x'.repeat(600) })
    })
    assert.equal(updBadAvatar.resp.status, 400)

    // 8. super admin can update any
    const updSuper = await jsonFetch(`${base}/api/v1/admin/users/${outsideUserId}/profile`, {
      method: 'PUT',
      headers: { ...superHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'by-super', avatarUrl: null })
    })
    assert.equal(updSuper.resp.status, 200)
    assert.equal(updSuper.json.data.nickname, 'by-super')

    // 9. nickname null falls back to username
    const updNullNick = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: null })
    })
    assert.equal(updNullNick.resp.status, 200)
    assert.equal(updNullNick.json.data.nickname, `u_sa_${stamp}`)

    // 10. update non-existent target -> 404
    const updMissing = await jsonFetch(`${base}/api/v1/admin/users/missing_${stamp}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'x' })
    })
    assert.equal(updMissing.resp.status, 404)

    // 11. reset-password within tenant
    const rpOk = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/reset-password`, {
      method: 'POST',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'abcdef1' })
    })
    assert.equal(rpOk.resp.status, 200)
    const afterRp = await userRepo.findOne({ where: { userId: storeAdminAId } })
    assert.ok(verifyPassword('abcdef1', afterRp.passwordHash))

    // 12. reset-password self forbidden
    const rpSelf = await jsonFetch(`${base}/api/v1/admin/users/${tenantAdminId}/reset-password`, {
      method: 'POST',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'abcdef1' })
    })
    assert.equal(rpSelf.resp.status, 400)

    // 13. reset-password too short -> 400
    const rpShort = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/reset-password`, {
      method: 'POST',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: '123' })
    })
    assert.equal(rpShort.resp.status, 400)

    // 14. reset-password outside tenant -> 403
    const rpForbid = await jsonFetch(`${base}/api/v1/admin/users/${outsideUserId}/reset-password`, {
      method: 'POST',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'abcdef1' })
    })
    assert.equal(rpForbid.resp.status, 403)

    // 15. reset-password cross-store for STORE_ADMIN actor -> 403
    const rpCross = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminBId}/reset-password`, {
      method: 'POST',
      headers: { ...storeAHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'abcdef1' })
    })
    assert.equal(rpCross.resp.status, 403)

    // 16. reset-password for non-existent user -> 404
    const rpMissing = await jsonFetch(`${base}/api/v1/admin/users/missing_rp_${stamp}/reset-password`, {
      method: 'POST',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'abcdef1' })
    })
    assert.equal(rpMissing.resp.status, 404)

    // 17. tenant detail endpoint returns scopes + storeName
    const detail = await jsonFetch(`${base}/api/v1/tenant/users/${storeAdminAId}`, {
      method: 'GET',
      headers: tenantHeaders
    })
    assert.equal(detail.resp.status, 200)
    assert.equal(detail.json.data.user.userId, storeAdminAId)
    assert.ok(Array.isArray(detail.json.data.scopes))
    assert.equal(detail.json.data.scopes[0].storeName, 'StoreA')

    // 18. tenant detail: empty userId -> 400
    const detailBad = await jsonFetch(`${base}/api/v1/tenant/users/%20`, {
      method: 'GET',
      headers: tenantHeaders
    })
    assert.equal(detailBad.resp.status, 400)

    // 19. tenant detail: unknown user -> 404
    const detailMissing = await jsonFetch(`${base}/api/v1/tenant/users/missing_td_${stamp}`, {
      method: 'GET',
      headers: tenantHeaders
    })
    assert.equal(detailMissing.resp.status, 404)

    // 20. tenant detail: user without scope in tenant -> 403
    const detailForbid = await jsonFetch(`${base}/api/v1/tenant/users/${outsideUserId}`, {
      method: 'GET',
      headers: tenantHeaders
    })
    assert.equal(detailForbid.resp.status, 403)

    // 21. store detail endpoint returns scope + storeName
    const sDetail = await jsonFetch(`${base}/api/v1/store/users/${storeAdminAId}`, {
      method: 'GET',
      headers: storeAHeaders
    })
    assert.equal(sDetail.resp.status, 200)
    assert.equal(sDetail.json.data.user.userId, storeAdminAId)
    assert.equal(sDetail.json.data.scopes[0].storeName, 'StoreA')

    // 22. store detail: empty userId -> 400
    const sDetailBad = await jsonFetch(`${base}/api/v1/store/users/%20`, {
      method: 'GET',
      headers: storeAHeaders
    })
    assert.equal(sDetailBad.resp.status, 400)

    // 23. store detail: user not scoped to this store -> 403
    const sDetailForbid = await jsonFetch(`${base}/api/v1/store/users/${storeAdminBId}`, {
      method: 'GET',
      headers: storeAHeaders
    })
    assert.equal(sDetailForbid.resp.status, 403)

    // 24. store detail: unknown user -> 404
    const sDetailMissing = await jsonFetch(`${base}/api/v1/store/users/missing_sd_${stamp}`, {
      method: 'GET',
      headers: storeAHeaders
    })
    assert.equal(sDetailMissing.resp.status, 404)

    // 25. profile update on non-ADMIN user target -> 404
    const customerId = `cust_${stamp}`
    await userRepo.save(
      userRepo.create({
        userId: customerId,
        userType: 'CUSTOMER',
        username: null,
        passwordHash: null,
        wechatOpenid: `openid_${stamp}`,
        wechatUnionid: null,
        nickname: 'C',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    const updCust = await jsonFetch(`${base}/api/v1/admin/users/${customerId}/profile`, {
      method: 'PUT',
      headers: { ...superHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'x' })
    })
    assert.equal(updCust.resp.status, 404)

    // 26. profile: avatarUrl null clears to ''
    const updClearAvatar = await jsonFetch(`${base}/api/v1/admin/users/${storeAdminAId}/profile`, {
      method: 'PUT',
      headers: { ...tenantHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ avatarUrl: null })
    })
    assert.equal(updClearAvatar.resp.status, 200)
    assert.equal(updClearAvatar.json.data.avatarUrl, '')
  })
})
