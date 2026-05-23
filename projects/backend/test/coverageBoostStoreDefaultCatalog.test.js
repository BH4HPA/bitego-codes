const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('store_default tenant can CRUD category and reorder goods', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = String(Date.now())

    const createdCat = await jsonFetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `分类_${suffix}`, subtitle: '', badgeText: '', sort: 0, status: 'ACTIVE' })
    })
    assert.equal(createdCat.resp.status, 201)
    const categoryId = createdCat.json.data.categoryId
    assert.ok(categoryId)

    const createdGood = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId, name: `菜品_${suffix}`, status: 'OFF_SHELF', basePriceCents: 100 })
    })
    assert.equal(createdGood.resp.status, 201)
    const goodId = createdGood.json.data.goodId
    assert.ok(goodId)

    const badReorder = await jsonFetch(`${base}/api/v1/categories/${categoryId}/goods/reorder`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodIds: [] })
    })
    assert.equal(badReorder.resp.status, 400)

    const reordered = await jsonFetch(`${base}/api/v1/categories/${categoryId}/goods/reorder`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodIds: [goodId] })
    })
    assert.equal(reordered.resp.status, 200)

    const updated = await jsonFetch(`${base}/api/v1/categories/${categoryId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `分类2_${suffix}` })
    })
    assert.equal(updated.resp.status, 200)

    const deleted = await jsonFetch(`${base}/api/v1/categories/${categoryId}`, {
      method: 'DELETE',
      headers: authz
    })
    assert.equal(deleted.resp.status, 200)
  })
})
