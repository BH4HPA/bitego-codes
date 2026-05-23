const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('category goods reorder persists and affects goods list ordering', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const { resp: catResp, json: catJson } = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `C_${suffix}`, sort: 0, status: 'ACTIVE' })
    })
    assert.equal(catResp.status, 201)
    const categoryId = catJson.data.categoryId

    const mkGood = async (name) => {
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

    const g1 = await mkGood(`G1_${suffix}`)
    const g2 = await mkGood(`G2_${suffix}`)

    const list1 = await jsonFetch(
      `${base}/api/v1/goods?categoryId=${encodeURIComponent(categoryId)}&page=1&pageSize=50&status=ON_SHELF`
    )
    assert.equal(list1.resp.status, 200)
    const ids1 = list1.json.data.list.map((x) => x.goodId)
    assert.equal(ids1.includes(g1), true)
    assert.equal(ids1.includes(g2), true)

    const { resp: rResp, json: rJson } = await jsonFetch(
      `${base}/api/v1/categories/${encodeURIComponent(categoryId)}/goods/reorder`,
      {
        method: 'PUT',
        headers: { ...authz, 'content-type': 'application/json' },
        body: JSON.stringify({ goodIds: [g2, g1] })
      }
    )
    assert.equal(rResp.status, 200)
    assert.equal(rJson.data.goodIdsCount, 2)

    const list2 = await jsonFetch(
      `${base}/api/v1/goods?categoryId=${encodeURIComponent(categoryId)}&page=1&pageSize=50&status=ON_SHELF`
    )
    assert.equal(list2.resp.status, 200)
    const ids2 = list2.json.data.list.map((x) => x.goodId)
    assert.equal(ids2[0], g2)
    assert.equal(ids2[1], g1)
    const row = list2.json.data.list.find((x) => x.goodId === g2)
    assert.ok(row.categorySortById && typeof row.categorySortById === 'object')
    assert.ok(Number(row.categorySortById[categoryId] || 0) > 0)

    const up = await jsonFetch(`${base}/api/v1/goods/${encodeURIComponent(g2)}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryIds: [categoryId], name: `G2U_${suffix}` })
    })
    assert.equal(up.resp.status, 200)

    const list3 = await jsonFetch(
      `${base}/api/v1/goods?categoryId=${encodeURIComponent(categoryId)}&page=1&pageSize=50&status=ON_SHELF`
    )
    assert.equal(list3.resp.status, 200)
    const ids3 = list3.json.data.list.map((x) => x.goodId)
    assert.equal(ids3[0], g2)
  })
})
