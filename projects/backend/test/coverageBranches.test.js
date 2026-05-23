const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { withServer, getAuthz, bearerAuthz } = require('./testUtils')

function png1x1Buffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/edp9WcAAAAASUVORK5CYII=',
    'base64'
  )
}

test('coverage branches', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  let originalPut
  let originalWxFetch
  let configRef
  let configOldAppId
  let configOldSecret

  await withServer(
    async ({ base, AppDataSource }) => {
      const { getRedis } = require('../dist/redis')
      const { config } = require('../dist/config')
      configRef = config
      const redis = getRedis()

      const adminAuthz = await getAuthz(base, 'ADMIN')
      const customerAuthz = await getAuthz(base, 'CUSTOMER')

      const noAuth = await fetch(`${base}/api/v1/stores/current`)
      assert.equal(noAuth.status, 200)

      const storeRepo = AppDataSource.getRepository(require('../dist/entities/Store').Store)
      await storeRepo.clear()
      const { ensureStoreDefaultTenantAndStore } = require('../dist/bootstrap/ensureStoreDefault')
      await ensureStoreDefaultTenantAndStore(AppDataSource)
      const storeGet = await fetch(`${base}/api/v1/stores/current`, { headers: adminAuthz })
      assert.equal(storeGet.status, 200)
      const store404 = await fetch(`${base}/api/v1/stores/current?storeId=store_missing_${suffix}`)
      assert.equal(store404.status, 404)

      const badCat = await fetch(`${base}/api/v1/categories`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
      assert.equal(badCat.status, 400)

      const cat404 = await fetch(`${base}/api/v1/categories/cat_not_found`, {
        method: 'PUT',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' })
      })
      assert.equal(cat404.status, 404)

      const goodBad = await fetch(`${base}/api/v1/goods`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' })
      })
      assert.equal(goodBad.status, 400)

      const good404 = await fetch(`${base}/api/v1/goods/good_not_found`, {
        method: 'PUT',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' })
      })
      assert.equal(good404.status, 404)

      const sku404 = await fetch(`${base}/api/v1/skus/sku_not_found`, {
        method: 'PUT',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ stock: 1 })
      })
      assert.equal(sku404.status, 404)

      const tableBad = await fetch(`${base}/api/v1/tables`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
      assert.equal(tableBad.status, 400)

      const table404 = await fetch(`${base}/api/v1/tables/tbl_not_found`, {
        method: 'PUT',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'FREE' })
      })
      assert.equal(table404.status, 404)

      const tableGet404 = await fetch(`${base}/api/v1/tables/tbl_not_found`)
      assert.equal(tableGet404.status, 404)

      const clear404 = await fetch(`${base}/api/v1/tables/tbl_not_found/force-clear`, {
        method: 'POST',
        headers: adminAuthz
      })
      assert.equal(clear404.status, 404)

      const clear404b = await fetch(`${base}/api/v1/tables/tbl_not_found/clear`, {
        method: 'POST',
        headers: adminAuthz
      })
      assert.equal(clear404b.status, 404)

      const filesNoAuth = await fetch(`${base}/api/v1/files`, { method: 'POST' })
      assert.equal(filesNoAuth.status, 401)

      const formEmpty = new FormData()
      formEmpty.append('path', 'goods')
      const filesNoFile = await fetch(`${base}/api/v1/files`, { method: 'POST', headers: adminAuthz, body: formEmpty })
      assert.equal(filesNoFile.status, 400)

      const formPng = new FormData()
      formPng.append('path', 'goods')
      formPng.append('file', new Blob([png1x1Buffer()], { type: 'image/png' }), 'a.png')

      originalPut = globalThis.__COS_PUT_OBJECT__
      globalThis.__COS_PUT_OBJECT__ = async () => {
        const e = new Error('denied')
        e.statusCode = 403
        throw e
      }
      const denied = await fetch(`${base}/api/v1/files`, { method: 'POST', headers: adminAuthz, body: formPng })
      assert.equal(denied.status, 403)

      globalThis.__COS_PUT_OBJECT__ = async () => {
        const e = new Error('notfound')
        e.statusCode = 404
        throw e
      }
      const notfound = await fetch(`${base}/api/v1/files`, { method: 'POST', headers: adminAuthz, body: formPng })
      assert.equal(notfound.status, 404)

      globalThis.__COS_PUT_OBJECT__ = async () => {
        const e = new Error('unavailable')
        e.statusCode = 503
        throw e
      }
      const unavailable = await fetch(`${base}/api/v1/files`, { method: 'POST', headers: adminAuthz, body: formPng })
      assert.equal(unavailable.status, 503)

      globalThis.__COS_PUT_OBJECT__ = async () => {
        const e = new Error('boom')
        e.statusCode = 500
        throw e
      }
      const boom = await fetch(`${base}/api/v1/files`, { method: 'POST', headers: adminAuthz, body: formPng })
      assert.equal(boom.status, 500)
      globalThis.__COS_PUT_OBJECT__ = originalPut

      const wxMissingCode = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
      assert.equal(wxMissingCode.status, 400)

      originalWxFetch = globalThis.__WX_FETCH__
      globalThis.__WX_FETCH__ = async () => {
        throw new Error('network')
      }
      const wxCode = `code_${suffix}`
      const wxNet = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: wxCode })
      })
      assert.equal(wxNet.status, 500)

      globalThis.__WX_FETCH__ = async () => {
        return {
          async json() {
            return { errcode: 40029, errmsg: 'invalid code' }
          }
        }
      }
      const wxFail = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `bad_${suffix}` })
      })
      assert.equal(wxFail.status, 400)

      const sessionKeyRaw = crypto.randomBytes(16)
      const sessionKeyB64 = sessionKeyRaw.toString('base64')
      const openid = `openid_${suffix}`
      globalThis.__WX_FETCH__ = async () => {
        return {
          async json() {
            return { openid, session_key: sessionKeyB64, errcode: 0, errmsg: 'ok' }
          }
        }
      }
      const wxOk = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `ok_${suffix}` })
      })
      assert.equal(wxOk.status, 200)
      const wxOkJson = await wxOk.json()
      const wxToken = wxOkJson.data.token
      assert.ok(wxToken)

      const wxReuse = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `ok_${suffix}` })
      })
      assert.equal(wxReuse.status, 400)

      globalThis.__WX_FETCH__ = async () => {
        return {
          async json() {
            return { errcode: 0, errmsg: 'ok' }
          }
        }
      }
      const wxBadPayload = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `miss_${suffix}` })
      })
      assert.equal(wxBadPayload.status, 500)
      globalThis.__WX_FETCH__ = originalWxFetch

      const me = await fetch(`${base}/api/v1/users/me`, { headers: bearerAuthz(wxToken) })
      assert.equal(me.status, 200)
      const meJson = await me.json()
      const wxUserId = meJson.data.userId

      await redis.del(`wxsk:${wxUserId}`)
      const phoneNoSk = await fetch(`${base}/api/v1/users/me/phone`, {
        method: 'POST',
        headers: { ...bearerAuthz(wxToken), 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedData: 'x', iv: 'y' })
      })
      assert.equal(phoneNoSk.status, 401)

      await redis.set(`wxsk:${wxUserId}`, sessionKeyB64, { EX: 60 })
      const phoneBadParams = await fetch(`${base}/api/v1/users/me/phone`, {
        method: 'POST',
        headers: { ...bearerAuthz(wxToken), 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedData: 'x' })
      })
      assert.equal(phoneBadParams.status, 400)

      const phoneDecryptFail = await fetch(`${base}/api/v1/users/me/phone`, {
        method: 'POST',
        headers: { ...bearerAuthz(wxToken), 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedData: 'x', iv: 'y' })
      })
      assert.equal(phoneDecryptFail.status, 400)

      const ivRaw = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv('aes-128-cbc', sessionKeyRaw, ivRaw)
      cipher.setAutoPadding(true)
      const payload = {
        phoneNumber: '13800138000',
        watermark: { appid: 'wrong_appid', timestamp: Math.floor(Date.now() / 1000) }
      }
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
        cipher.final()
      ]).toString('base64')
      const phoneWrongWatermark = await fetch(`${base}/api/v1/users/me/phone`, {
        method: 'POST',
        headers: { ...bearerAuthz(wxToken), 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedData: encrypted, iv: ivRaw.toString('base64') })
      })
      assert.equal(phoneWrongWatermark.status, 400)

      configOldAppId = configRef.wechatMiniProgram.appId
      configOldSecret = configRef.wechatMiniProgram.secret
      configRef.wechatMiniProgram.appId = ''
      configRef.wechatMiniProgram.secret = ''
      const wxNoCred = await fetch(`${base}/api/v1/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `nocred_${suffix}` })
      })
      assert.equal(wxNoCred.status, 500)
      configRef.wechatMiniProgram.appId = configOldAppId
      configRef.wechatMiniProgram.secret = configOldSecret

      const custForbidden = await fetch(`${base}/api/v1/dashboard/overview`, { headers: customerAuthz })
      assert.equal(custForbidden.status, 403)

      const catCreate = await fetch(`${base}/api/v1/categories`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `C2_${suffix}`, sort: 1, status: 'ACTIVE' })
      })
      assert.equal(catCreate.status, 201)
      const categoryId = (await catCreate.json()).data.categoryId

      const goodCreate = await fetch(`${base}/api/v1/goods`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ categoryId, name: `G2_${suffix}`, status: 'ON_SHELF' })
      })
      assert.equal(goodCreate.status, 201)
      const goodId = (await goodCreate.json()).data.goodId

      const goodUpdate = await fetch(`${base}/api/v1/goods/${goodId}`, {
        method: 'PUT',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'd2' })
      })
      assert.equal(goodUpdate.status, 200)

      const goodDel = await fetch(`${base}/api/v1/goods/${goodId}`, { method: 'DELETE', headers: adminAuthz })
      assert.equal(goodDel.status, 200)

      const goodGet404 = await fetch(`${base}/api/v1/goods/good_not_found_${suffix}`)
      assert.equal(goodGet404.status, 404)

      const skuCreate = await fetch(`${base}/api/v1/skus`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ goodId, specCombination: '默认', priceCents: 1000, stock: 1, status: 'ON_SHELF' })
      })
      assert.equal(skuCreate.status, 201)
      const skuId = (await skuCreate.json()).data.skuId

      const skuDel = await fetch(`${base}/api/v1/skus/${skuId}`, { method: 'DELETE', headers: adminAuthz })
      assert.equal(skuDel.status, 200)

      const orderInvalid = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `inv_${suffix}` },
        body: JSON.stringify({})
      })
      assert.equal(orderInvalid.status, 400)

      const orderTableMissing = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `miss_${suffix}` },
        body: JSON.stringify({ tableId: `tbl_missing_${suffix}`, cartVersion: 1 })
      })
      assert.equal(orderTableMissing.status, 404)

      const { Table } = require('../dist/entities/Table')
      const { TableCart } = require('../dist/entities/TableCart')
      const { TableCartItem } = require('../dist/entities/TableCartItem')
      const { SKU } = require('../dist/entities/SKU')
      const { Good } = require('../dist/entities/Good')
      const { OrderItem } = require('../dist/entities/OrderItem')

      const tableRepo = AppDataSource.getRepository(Table)
      const cartRepo = AppDataSource.getRepository(TableCart)
      const cartItemRepo = AppDataSource.getRepository(TableCartItem)
      const skuRepo = AppDataSource.getRepository(SKU)
      const goodRepo = AppDataSource.getRepository(Good)
      const orderItemRepo = AppDataSource.getRepository(OrderItem)

      const tableId = `T2_${suffix}`
      const tableCode = `T2${suffix.replace(/[^0-9]/g, '').slice(-10)}`.slice(0, 12) || 'T2_TEST'
      await tableRepo.save(
        tableRepo.create({
          tableId,
          storeId: 'store_default',
          code: tableCode,
          status: 'FREE',
          sessionVersion: 1,
          sessionClosedAt: null
        })
      )

      const cartId = `cart2_${suffix}`
      await cartRepo.save(
        cartRepo.create({
          cartId,
          storeId: 'store_default',
          tableId,
          sessionVersion: 1,
          version: 1,
          openedAt: new Date()
        })
      )

      const orderCartEmpty = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `empty_${suffix}` },
        body: JSON.stringify({ tableId, cartVersion: 1 })
      })
      assert.equal(orderCartEmpty.status, 400)

      const g = await goodRepo.save(
        goodRepo.create({
          goodId: `good2_${suffix}`,
          storeId: 'store_default',
          categoryId,
          name: `G3_${suffix}`,
          description: '',
          imageUrl: '',
          sales: 0,
          status: 'ON_SHELF'
        })
      )

      const skuOff = await skuRepo.save(
        skuRepo.create({
          skuId: `sku_off_${suffix}`,
          goodId: g.goodId,
          specCombination: '默认',
          price: '1000',
          stock: 10,
          status: 'OFF_SHELF'
        })
      )
      await cartItemRepo.save(
        cartItemRepo.create({
          cartItemId: `ci_off_${suffix}`,
          cartId,
          skuId: skuOff.skuId,
          goodId: g.goodId,
          goodNameSnapshot: g.name,
          specTextSnapshot: '默认',
          unitPriceSnapshot: '1000',
          qty: 1,
          addedByUserId: 'usr_1',
          addedByNicknameSnapshot: '',
          addedByAvatarSnapshot: ''
        })
      )
      const orderSkuOff = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `off_${suffix}` },
        body: JSON.stringify({ tableId, cartVersion: 1 })
      })
      assert.equal(orderSkuOff.status, 400)
      await cartItemRepo.delete({ cartId })

      const skuOut = await skuRepo.save(
        skuRepo.create({
          skuId: `sku_out_${suffix}`,
          goodId: g.goodId,
          specCombination: '默认',
          price: '1000',
          stock: 0,
          status: 'ON_SHELF'
        })
      )
      await cartItemRepo.save(
        cartItemRepo.create({
          cartItemId: `ci_out_${suffix}`,
          cartId,
          skuId: skuOut.skuId,
          goodId: g.goodId,
          goodNameSnapshot: g.name,
          specTextSnapshot: '默认',
          unitPriceSnapshot: '1000',
          qty: 2,
          addedByUserId: 'usr_1',
          addedByNicknameSnapshot: '',
          addedByAvatarSnapshot: ''
        })
      )
      const orderOut = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `out_${suffix}` },
        body: JSON.stringify({ tableId, cartVersion: 1 })
      })
      assert.equal(orderOut.status, 400)
      await cartItemRepo.delete({ cartId })

      await cartItemRepo.save(
        cartItemRepo.create({
          cartItemId: `ci_missing_${suffix}`,
          cartId,
          skuId: `sku_missing_${suffix}`,
          goodId: g.goodId,
          goodNameSnapshot: g.name,
          specTextSnapshot: '默认',
          unitPriceSnapshot: '1000',
          qty: 1,
          addedByUserId: 'usr_1',
          addedByNicknameSnapshot: '',
          addedByAvatarSnapshot: ''
        })
      )
      const orderSkuMissing = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `smiss_${suffix}` },
        body: JSON.stringify({ tableId, cartVersion: 1 })
      })
      assert.equal(orderSkuMissing.status, 400)
      await cartItemRepo.delete({ cartId })

      const skuOk = await skuRepo.save(
        skuRepo.create({
          skuId: `sku_ok_${suffix}`,
          goodId: g.goodId,
          specCombination: '默认',
          price: '1000',
          stock: 10,
          status: 'ON_SHELF'
        })
      )
      await cartItemRepo.save(
        cartItemRepo.create({
          cartItemId: `ci_ok_${suffix}`,
          cartId,
          skuId: skuOk.skuId,
          goodId: g.goodId,
          goodNameSnapshot: g.name,
          specTextSnapshot: '默认',
          unitPriceSnapshot: '1000',
          qty: 1,
          addedByUserId: 'usr_1',
          addedByNicknameSnapshot: '',
          addedByAvatarSnapshot: ''
        })
      )

      await redis.set(`lock:order:${tableId}`, '1', { PX: 30000 })
      const orderLocked = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `lock_${suffix}` },
        body: JSON.stringify({ tableId, cartVersion: 1 })
      })
      assert.equal(orderLocked.status, 429)
      await redis.del(`lock:order:${tableId}`)

      const okOrder = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `ok_${suffix}` },
        body: JSON.stringify({ tableId, cartVersion: 1 })
      })
      assert.equal(okOrder.status, 201)
      const okOrderJson = await okOrder.json()
      const orderId = okOrderJson.data.orderId

      const orderGetCustomer = await fetch(`${base}/api/v1/orders/${orderId}`, { headers: customerAuthz })
      assert.equal(orderGetCustomer.status, 403)

      const orderRefund2 = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `rf_${suffix}` },
        body: JSON.stringify({ reason: 'x' })
      })
      assert.equal(orderRefund2.status, 202)

      const item = await orderItemRepo.findOne({ where: { orderId } })
      assert.ok(item)
      const served = await fetch(`${base}/api/v1/orders/${orderId}/items/${item.orderItemId}/serve`, {
        method: 'POST',
        headers: adminAuthz
      })
      assert.equal(served.status, 200)

      const statusMaking = await fetch(`${base}/api/v1/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { ...adminAuthz, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Making' })
      })
      assert.equal(statusMaking.status, 200)

      const refundNotAllowed = await fetch(`${base}/api/v1/orders/${orderId}/refunds`, {
        method: 'POST',
        headers: { ...adminAuthz, 'content-type': 'application/json', 'X-Request-Id': `rf2_${suffix}` },
        body: JSON.stringify({ reason: 'x' })
      })
      assert.equal(refundNotAllowed.status, 400)
    },
    async () => {
      process.env.WX_MINIPROGRAM_APPID = process.env.WX_MINIPROGRAM_APPID || 'wx_test_appid'
      process.env.WX_MINIPROGRAM_SECRET = process.env.WX_MINIPROGRAM_SECRET || 'wx_test_secret'
    },
    async () => {
      if (typeof originalPut !== 'undefined') globalThis.__COS_PUT_OBJECT__ = originalPut
      if (typeof originalWxFetch !== 'undefined') globalThis.__WX_FETCH__ = originalWxFetch
      if (configRef && typeof configOldAppId !== 'undefined') configRef.wechatMiniProgram.appId = configOldAppId
      if (configRef && typeof configOldSecret !== 'undefined') configRef.wechatMiniProgram.secret = configOldSecret
    }
  )
})
