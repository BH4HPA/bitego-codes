const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('goods list exposes soldOut when all SKUs are off-shelf or out of stock', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const mkCategory = async () => {
      const { resp, json } = await jsonFetch(`${base}/api/v1/categories`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ name: `C_${suffix}`, sort: 0, status: 'ACTIVE' })
      })
      assert.equal(resp.status, 201)
      return json.data.categoryId
    }

    const mkGood = async (categoryId, name) => {
      const { resp, json } = await jsonFetch(`${base}/api/v1/goods`, {
        method: 'POST',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryIds: [categoryId],
          name,
          status: 'ON_SHELF',
          basePriceCents: 100
        })
      })
      assert.equal(resp.status, 201)
      return json.data.goodId
    }

    const listSku = async (goodId) => {
      const { resp, json } = await jsonFetch(`${base}/api/v1/skus?goodId=${encodeURIComponent(goodId)}`, {
        headers: authz
      })
      assert.equal(resp.status, 200)
      return json.data.list
    }

    const bulkUpdateSkus = async (skuIds, patch) => {
      const { resp } = await jsonFetch(`${base}/api/v1/skus/bulk`, {
        method: 'PUT',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ skuIds, ...patch })
      })
      assert.equal(resp.status, 200)
    }

    const categoryId = await mkCategory()
    const gAvail = await mkGood(categoryId, `GA_${suffix}`)
    const gOut = await mkGood(categoryId, `GO_${suffix}`)
    const gOff = await mkGood(categoryId, `GF_${suffix}`)

    const avSkus = (await listSku(gAvail)).map((x) => x.skuId)
    await bulkUpdateSkus(avSkus, { status: 'ON_SHELF', stock: 10 })

    const outSkus = (await listSku(gOut)).map((x) => x.skuId)
    await bulkUpdateSkus(outSkus, { status: 'ON_SHELF', stock: 0 })

    const offSkus = (await listSku(gOff)).map((x) => x.skuId)
    await bulkUpdateSkus(offSkus, { status: 'OFF_SHELF', stock: 10 })

    const { resp: listResp, json: listJson } = await jsonFetch(
      `${base}/api/v1/goods?categoryId=${encodeURIComponent(categoryId)}&page=1&pageSize=50&status=ON_SHELF`
    )
    assert.equal(listResp.status, 200)
    const byId = new Map(listJson.data.list.map((x) => [x.goodId, x]))
    assert.equal(byId.get(gAvail).soldOut, false)
    assert.equal(byId.get(gOut).soldOut, true)
    assert.equal(byId.get(gOff).soldOut, true)
  })
})
