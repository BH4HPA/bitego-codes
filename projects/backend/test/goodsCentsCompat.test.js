const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz } = require('./testUtils')

test('goods supports basePriceCents and option priceCents', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`

    const resp = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_${suffix}`,
        basePriceCents: 500,
        status: 'ON_SHELF',
        optionGroups: [
          {
            id: `og_${suffix}`,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: `op1_${suffix}`, name: '小杯', priceCents: 0 },
              { id: `op2_${suffix}`, name: '大杯', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(resp.status, 201)
    const goodId = (await resp.json()).data.goodId

    const detail = await fetch(`${base}/api/v1/goods/${goodId}`)
    assert.equal(detail.status, 200)
    const json = await detail.json()
    assert.equal(json.data.basePriceCents, 500)
    assert.equal(json.data.minPriceCents, 500)

    const skus = json.data.skus
    assert.equal(skus.length, 2)
    const cents = new Set(skus.map((s) => s.priceCents))
    assert.ok(cents.has(500))
    assert.ok(cents.has(700))
  })
})

test('goods basePriceCents validation rejects non-integer and negative', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const bad1 = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${Date.now()}`, basePriceCents: 1.5 })
    })
    assert.equal(bad1.status, 400)

    const bad2 = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${Date.now()}`, basePriceCents: -1 })
    })
    assert.equal(bad2.status, 400)
  })
})

test('skus supports priceCents and validates stock', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const goodCreate = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_${Date.now()}`, status: 'ON_SHELF' })
    })
    const goodId = (await goodCreate.json()).data.goodId

    const skuCreate = await fetch(`${base}/api/v1/skus`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ goodId, priceCents: 1234, stock: 0, status: 'ON_SHELF' })
    })
    assert.equal(skuCreate.status, 201)
    const skuId = (await skuCreate.json()).data.skuId

    const skuUpdateBad = await fetch(`${base}/api/v1/skus/${skuId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ stock: -1 })
    })
    assert.equal(skuUpdateBad.status, 400)

    const skuList = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList.status, 200)
    const listJson = await skuList.json()
    const created = listJson.data.list.find((x) => x.skuId === skuId)
    assert.ok(created)
    assert.equal(created.priceCents, 1234)
  })
})

test('goods list supports name filter and returns cents fields', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const name = `G_LIST_${suffix}`
    const create = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name, status: 'ON_SHELF', basePriceCents: 99 })
    })
    assert.equal(create.status, 201)
    const list = await fetch(`${base}/api/v1/goods?status=ON_SHELF&name=${encodeURIComponent(name)}&page=1&pageSize=20`)
    assert.equal(list.status, 200)
    const json = await list.json()
    assert.ok(Array.isArray(json.data.list))
    assert.equal(json.data.list[0].basePriceCents, 99)
    assert.equal(typeof json.data.list[0].minPriceCents, 'number')
  })
})

test('goods rejects negative option priceCents', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const resp = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_BAD_OPT_${suffix}`,
        optionGroups: [
          {
            id: `og_${suffix}`,
            name: '加料',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [{ id: `op_${suffix}`, name: '珍珠', priceCents: -1 }]
          }
        ]
      })
    })
    assert.equal(resp.status, 400)
  })
})
