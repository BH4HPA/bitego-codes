const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz } = require('./testUtils')

test('goods validates required fields', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const resp = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test' })
    })
    assert.equal(resp.status, 400)
  })
})

test('goods PUT validates basePriceCents string and rejects non-number', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const create = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${Date.now()}`, status: 'ON_SHELF' })
    })
    const goodId = (await create.json()).data.goodId

    const okResp = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ basePriceCents: '600' })
    })
    assert.equal(okResp.status, 200)

    const badResp = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ basePriceCents: 'abc' })
    })
    assert.equal(badResp.status, 400)
  })
})

test('goods PUT with invalid optionGroups returns 400', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const create = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${Date.now()}`, status: 'ON_SHELF' })
    })
    const goodId = (await create.json()).data.goodId

    const bad = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        optionGroups: [
          {
            id: `og_${Date.now()}`,
            name: '加料',
            isRequired: true,
            minSelection: 1,
            maxSelection: 2,
            options: [{ id: 'a', name: '珍珠', priceCents: 100 }]
          }
        ]
      })
    })
    assert.equal(bad.status, 400)
  })
})

test('skus POST validates stock and accepts priceCents as string', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const createGood = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${Date.now()}`, status: 'ON_SHELF' })
    })
    const goodId = (await createGood.json()).data.goodId

    const badStock = await fetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, priceCents: 1023, stock: '1.5', status: 'ON_SHELF' })
    })
    assert.equal(badStock.status, 400)

    const okSku = await fetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, priceCents: '1023', stock: '1', status: 'ON_SHELF' })
    })
    assert.equal(okSku.status, 201)
    const skuId = (await okSku.json()).data.skuId

    const put = await fetch(`${base}/api/v1/skus/${skuId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ priceCents: '999', stock: 2 })
    })
    assert.equal(put.status, 200)
  })
})

test('goods supports multiple categories via categoryIds', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const c1 = await fetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `甄选_${Date.now()}`, sort: 100 })
    })
    assert.equal(c1.status, 201)
    const cat1 = (await c1.json()).data.categoryId

    const c2 = await fetch(`${base}/api/v1/categories`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `饮品_${Date.now()}`, sort: 10 })
    })
    assert.equal(c2.status, 201)
    const cat2 = (await c2.json()).data.categoryId

    const create = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryIds: [cat1, cat2],
        name: `G_${Date.now()}`,
        status: 'OFF_SHELF',
        basePriceCents: 100
      })
    })
    assert.equal(create.status, 201)
    const goodId = (await create.json()).data.goodId

    const listByCat2 = await fetch(`${base}/api/v1/goods?categoryId=${cat2}&page=1&pageSize=20&status=OFF_SHELF`, {
      headers: authz
    })
    assert.equal(listByCat2.status, 200)
    const list = (await listByCat2.json()).data.list
    assert.ok(list.some((x) => x.goodId === goodId))

    const detail = await fetch(`${base}/api/v1/goods/${goodId}`, { headers: authz })
    assert.equal(detail.status, 200)
    const detailJson = await detail.json()
    assert.ok(Array.isArray(detailJson.data.categoryIds))
    assert.ok(detailJson.data.categoryIds.includes(cat1))
    assert.ok(detailJson.data.categoryIds.includes(cat2))

    const upd = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryIds: [cat2] })
    })
    assert.equal(upd.status, 200)

    const listByCat1 = await fetch(`${base}/api/v1/goods?categoryId=${cat1}&page=1&pageSize=20&status=OFF_SHELF`, {
      headers: authz
    })
    assert.equal(listByCat1.status, 200)
    const list2 = (await listByCat1.json()).data.list
    assert.ok(!list2.some((x) => x.goodId === goodId))
  })
})
