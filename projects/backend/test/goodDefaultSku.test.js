const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('good defaultSkuId is set on create and can be updated', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const { resp: createCatResp, json: createCatJson } = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `分类_${Date.now()}`, sort: 100, status: 'ACTIVE' })
    })
    assert.equal(createCatResp.status, 201)
    const categoryId = createCatJson.data.categoryId

    const { resp: createGoodResp, json: createGoodJson } = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId,
        name: `菜品_${Date.now()}`,
        status: 'OFF_SHELF',
        basePriceCents: 500,
        optionGroups: []
      })
    })
    assert.equal(createGoodResp.status, 201)
    const goodId = createGoodJson.data.goodId

    const { resp: getGoodResp, json: getGoodJson } = await jsonFetch(
      `${base}/api/v1/goods/${encodeURIComponent(goodId)}`,
      {
        method: 'GET',
        headers: authz
      }
    )
    assert.equal(getGoodResp.status, 200)
    const d1 = getGoodJson.data
    assert.ok(d1.defaultSkuId)
    assert.ok(Array.isArray(d1.skus))
    assert.ok(d1.skus.some((s) => s.skuId === d1.defaultSkuId))

    const { resp: createSkuResp, json: createSkuJson } = await jsonFetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, specCombination: '备用', priceCents: 600, stock: 3, status: 'ON_SHELF' })
    })
    assert.equal(createSkuResp.status, 201)
    const sku2 = createSkuJson.data.skuId

    const { resp: updResp } = await jsonFetch(`${base}/api/v1/goods/${encodeURIComponent(goodId)}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ defaultSkuId: sku2 })
    })
    assert.equal(updResp.status, 200)

    const { resp: getGood2Resp, json: getGood2Json } = await jsonFetch(
      `${base}/api/v1/goods/${encodeURIComponent(goodId)}`,
      {
        method: 'GET',
        headers: authz
      }
    )
    assert.equal(getGood2Resp.status, 200)
    assert.equal(getGood2Json.data.defaultSkuId, sku2)
  })
})
