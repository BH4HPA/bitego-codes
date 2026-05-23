const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, jsonFetch, getDevToken, storeAdminAuthz } = require('./testUtils')

test('goods supports detailMarkdown for detail page', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const adminToken = await getDevToken(base, 'ADMIN')
    const bad = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(adminToken), 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${suffix}`, detailMarkdown: 1 })
    })
    assert.equal(bad.resp.status, 400)

    const created = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...storeAdminAuthz(adminToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_${suffix}`,
        description: '一句话',
        detailMarkdown: '## 详情\n\n- A\n- B',
        status: 'ON_SHELF'
      })
    })
    assert.equal(created.resp.status, 201)
    const goodId = created.json.data.goodId
    assert.ok(goodId)

    const detail = await jsonFetch(`${base}/api/v1/goods/${encodeURIComponent(goodId)}`)
    assert.equal(detail.resp.status, 200)
    assert.equal(detail.json.data.description, '一句话')
    assert.equal(detail.json.data.detailMarkdown, '## 详情\n\n- A\n- B')

    const updated = await jsonFetch(`${base}/api/v1/goods/${encodeURIComponent(goodId)}`, {
      method: 'PUT',
      headers: { ...storeAdminAuthz(adminToken), 'content-type': 'application/json' },
      body: JSON.stringify({ detailMarkdown: 123 })
    })
    assert.equal(updated.resp.status, 200)

    const detail2 = await jsonFetch(`${base}/api/v1/goods/${encodeURIComponent(goodId)}`)
    assert.equal(detail2.resp.status, 200)
    assert.equal(detail2.json.data.detailMarkdown, '')
  })
})
