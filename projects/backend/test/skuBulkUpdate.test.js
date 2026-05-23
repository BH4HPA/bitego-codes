const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('skus bulk update supports status/stock and stockDelta', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const { resp: createGoodResp, json: createGoodJson } = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${Date.now()}`, status: 'OFF_SHELF' })
    })
    assert.equal(createGoodResp.status, 201)
    const goodId = createGoodJson.data.goodId

    const { resp: sku1Resp, json: sku1Json } = await jsonFetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, priceCents: 100, stock: 0, status: 'OFF_SHELF' })
    })
    assert.equal(sku1Resp.status, 201)
    const sku1 = sku1Json.data.skuId

    const { resp: sku2Resp, json: sku2Json } = await jsonFetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, priceCents: 200, stock: 0, status: 'OFF_SHELF' })
    })
    assert.equal(sku2Resp.status, 201)
    const sku2 = sku2Json.data.skuId

    const { resp: bulk1Resp, json: bulk1Json } = await jsonFetch(`${base}/api/v1/skus/bulk`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ skuIds: [sku1, sku2], status: 'ON_SHELF', stock: 5 })
    })
    assert.equal(bulk1Resp.status, 200)
    assert.equal(bulk1Json.data.skuIdsCount, 2)

    const { resp: bulk2Resp } = await jsonFetch(`${base}/api/v1/skus/bulk`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ skuIds: [sku1], stockDelta: -3 })
    })
    assert.equal(bulk2Resp.status, 200)

    const { resp: listResp, json: listJson } = await jsonFetch(
      `${base}/api/v1/skus?goodId=${encodeURIComponent(goodId)}`,
      {
        method: 'GET',
        headers: authz
      }
    )
    assert.equal(listResp.status, 200)
    const byId = new Map(listJson.data.list.map((x) => [x.skuId, x]))
    assert.equal(byId.get(sku1).status, 'ON_SHELF')
    assert.equal(byId.get(sku2).status, 'ON_SHELF')
    assert.equal(byId.get(sku1).stock, 2)
    assert.equal(byId.get(sku2).stock, 5)
  })
})

test('skus bulk update validates params', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const r1 = await jsonFetch(`${base}/api/v1/skus/bulk`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ skuIds: [] })
    })
    assert.equal(r1.resp.status, 400)

    const r2 = await jsonFetch(`${base}/api/v1/skus/bulk`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ skuIds: ['sku_x'] })
    })
    assert.equal(r2.resp.status, 400)

    const r3 = await jsonFetch(`${base}/api/v1/skus/bulk`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ skuIds: ['sku_x'], stockDelta: 0 })
    })
    assert.equal(r3.resp.status, 400)
  })
})
