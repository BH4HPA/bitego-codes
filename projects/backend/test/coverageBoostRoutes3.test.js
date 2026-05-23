const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getDevToken, jsonFetch, storeAdminAuthz } = require('./testUtils')

test('categories: invalid payload and not-found paths', async () => {
  await withServer(async ({ base }) => {
    const token = await getDevToken(base, 'ADMIN')
    const authz = { ...storeAdminAuthz(token), 'content-type': 'application/json' }

    const r0 = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: authz,
      body: JSON.stringify({})
    })
    assert.equal(r0.resp.status, 400)

    const missingId = `cat_missing_${Date.now()}`
    const r1 = await jsonFetch(`${base}/api/v1/categories/${encodeURIComponent(missingId)}`, {
      method: 'PUT',
      headers: authz,
      body: JSON.stringify({ name: 'x' })
    })
    assert.equal(r1.resp.status, 404)

    const r2 = await jsonFetch(`${base}/api/v1/categories/${encodeURIComponent(missingId)}`, {
      method: 'DELETE',
      headers: storeAdminAuthz(token)
    })
    assert.equal(r2.resp.status, 404)

    const r3 = await jsonFetch(`${base}/api/v1/categories/${encodeURIComponent(missingId)}/goods/reorder`, {
      method: 'PUT',
      headers: authz,
      body: JSON.stringify({ goodIds: [' ', 123] })
    })
    assert.equal(r3.resp.status, 400)
  })
})

test('categories: TENANT_ADMIN cannot edit on non-primary store', async () => {
  await withServer(async (ctx) => {
    const AdminScope = require('../dist/entities/AdminScope').AdminScope
    const Store = require('../dist/entities/Store').Store
    const Tenant = require('../dist/entities/Tenant').Tenant

    const tenantId = `t_${Date.now()}`
    const primaryStoreId = `sp_${Date.now()}`
    const subStoreId = `ss_${Date.now()}`

    const storeRepo = ctx.AppDataSource.getRepository(Store)
    const tenantRepo = ctx.AppDataSource.getRepository(Tenant)
    await tenantRepo.save(
      tenantRepo.create({
        tenantId,
        type: 'CHAIN',
        brandName: 'B',
        brandLogoUrl: null,
        primaryStoreId,
        status: 'ACTIVE',
        lastSyncedChangeId: 0,
        lastSyncedAt: null
      })
    )
    await storeRepo.save(
      storeRepo.create({
        storeId: primaryStoreId,
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
        storeId: subStoreId,
        tenantId,
        isPrimary: 0,
        subName: 'S',
        name: 'S',
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
        storeId: null,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE'
      })
    )

    const r = await jsonFetch(`${ctx.base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(token, tenantId, subStoreId), 'content-type': 'application/json' },
      body: JSON.stringify({ name: '饮品', sort: 10 })
    })
    assert.equal(r.resp.status, 403)
  })
})

test('tables: update and clear routes delete old carts', async () => {
  await withServer(async (ctx) => {
    const TableCart = require('../dist/entities/TableCart').TableCart
    const TableCartItem = require('../dist/entities/TableCartItem').TableCartItem

    const token = await getDevToken(ctx.base, 'ADMIN')
    const authz = { ...storeAdminAuthz(token), 'content-type': 'application/json' }

    const r0 = await jsonFetch(`${ctx.base}/api/v1/tables`, {
      method: 'POST',
      headers: authz,
      body: JSON.stringify({})
    })
    assert.equal(r0.resp.status, 400)

    const r1 = await jsonFetch(`${ctx.base}/api/v1/tables`, {
      method: 'POST',
      headers: authz,
      body: JSON.stringify({ code: `A_${Date.now()}`, status: 'OCCUPIED' })
    })
    assert.equal(r1.resp.status, 201)
    const tableId = r1.json.data.tableId

    const r2 = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}`, {
      method: 'PUT',
      headers: authz,
      body: JSON.stringify({ code: `B_${Date.now()}`, status: 'FREE' })
    })
    assert.equal(r2.resp.status, 200)

    const cartRepo = ctx.AppDataSource.getRepository(TableCart)
    const cartItemRepo = ctx.AppDataSource.getRepository(TableCartItem)

    const insertCart = async (sessionVersion) => {
      const cartId = `cart_${Date.now()}_${Math.floor(Math.random() * 10000)}`
      await cartRepo.save(
        cartRepo.create({
          cartId,
          storeId: 'store_default',
          tableId,
          sessionVersion,
          version: 1,
          openedAt: new Date()
        })
      )
      await cartItemRepo.save(
        cartItemRepo.create({
          cartItemId: `ci_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          cartId,
          skuId: `sku_${Date.now()}`,
          goodId: `good_${Date.now()}`,
          goodNameSnapshot: 'x',
          specTextSnapshot: 'default',
          unitPriceSnapshot: '0',
          qty: 1,
          priceItemKey: null,
          nonStockSelectionsSnapshot: null,
          priceItemSnapshot: null,
          addedByUserId: null,
          addedByNicknameSnapshot: null,
          addedByAvatarSnapshot: null
        })
      )
      return cartId
    }

    await insertCart(1)
    const r3 = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}/clear`, {
      method: 'POST',
      headers: storeAdminAuthz(token)
    })
    assert.equal(r3.resp.status, 200)
    const afterClear = await cartRepo.find({ where: { tableId } })
    assert.equal(afterClear.length, 0)

    await insertCart(2)
    const r4 = await jsonFetch(`${ctx.base}/api/v1/tables/${encodeURIComponent(tableId)}/force-clear`, {
      method: 'POST',
      headers: storeAdminAuthz(token)
    })
    assert.equal(r4.resp.status, 200)
    const afterForce = await cartRepo.find({ where: { tableId } })
    assert.equal(afterForce.length, 0)

    const r5 = await jsonFetch(`${ctx.base}/api/v1/tables/tbl_missing_${Date.now()}/clear`, {
      method: 'POST',
      headers: storeAdminAuthz(token)
    })
    assert.equal(r5.resp.status, 404)
  })
})

test('tables: qrcode regenerate guards', async () => {
  const oldAppId = process.env.WX_MINIPROGRAM_APPID
  const oldSecret = process.env.WX_MINIPROGRAM_SECRET
  process.env.WX_MINIPROGRAM_APPID = ''
  process.env.WX_MINIPROGRAM_SECRET = ''
  try {
    await withServer(async ({ base }) => {
      const token = await getDevToken(base, 'ADMIN')
      const authz = { ...storeAdminAuthz(token), 'content-type': 'application/json' }

      const { resp: cResp, json: cJson } = await jsonFetch(`${base}/api/v1/tables`, {
        method: 'POST',
        headers: authz,
        body: JSON.stringify({ code: `Q_${Date.now()}` })
      })
      assert.equal(cResp.status, 201)
      const tableId = cJson.data.tableId

      const r0 = await jsonFetch(`${base}/api/v1/tables/tbl_missing_${Date.now()}/qrcode`, {
        method: 'POST',
        headers: authz,
        body: JSON.stringify({})
      })
      assert.equal(r0.resp.status, 404)

      const r1 = await jsonFetch(`${base}/api/v1/tables/${encodeURIComponent(tableId)}/qrcode`, {
        method: 'POST',
        headers: authz,
        body: JSON.stringify({ envVersion: 'bad' })
      })
      assert.equal(r1.resp.status, 400)

      const r2 = await jsonFetch(`${base}/api/v1/tables/${encodeURIComponent(tableId)}/qrcode`, {
        method: 'POST',
        headers: authz,
        body: JSON.stringify({})
      })
      assert.equal(r2.resp.status, 409)
    })
  } finally {
    process.env.WX_MINIPROGRAM_APPID = oldAppId
    process.env.WX_MINIPROGRAM_SECRET = oldSecret
  }
})

test('auth: login invalid params and invalid credentials', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const { User } = require('../dist/entities/User')
    const { hashPassword } = require('../dist/utils/password')

    const r0 = await jsonFetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    })
    assert.equal(r0.resp.status, 400)

    const r1 = await jsonFetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' })
    })
    assert.equal(r1.resp.status, 401)

    const r2 = await jsonFetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    })
    assert.equal(r2.resp.status, 200)
    assert.ok(r2.json && r2.json.data && r2.json.data.token)

    const username = `u_${Date.now()}`
    const password = `p_${Date.now()}`
    const userRepo = AppDataSource.getRepository(User)
    await userRepo.save(
      userRepo.create({
        userId: `usr_${Date.now()}`,
        userType: 'ADMIN',
        username,
        passwordHash: hashPassword(password),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: 'U',
        avatarUrl: '',
        phoneNumber: null,
        status: 'ACTIVE',
        lastLoginAt: null
      })
    )
    const r3 = await jsonFetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    assert.equal(r3.resp.status, 200)
    assert.ok(r3.json && r3.json.data && r3.json.data.token)
  })
})
