const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz } = require('./testUtils')

test('optionGroups generates skus and prices (supports multi-select)', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const createGood = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500,
        optionGroups: [
          {
            id: `og1_${suffix}`,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 2,
            options: [
              { id: `op1_${suffix}`, name: '小杯', priceCents: 0 },
              { id: `op2_${suffix}`, name: '大杯', priceCents: 200 }
            ]
          },
          {
            id: `og2_${suffix}`,
            name: '甜度',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: `op3_${suffix}`, name: '正常糖', priceCents: 0 },
              { id: `op4_${suffix}`, name: '少糖', priceCents: 100 }
            ]
          }
        ]
      })
    })
    assert.equal(createGood.status, 201)
    const goodId = (await createGood.json()).data.goodId

    const skuList = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList.status, 200)
    const skuJson = await skuList.json()
    const skus = skuJson.data.list
    assert.equal(skus.length, 6)

    const priceCentsSet = new Set(skus.map((s) => s.priceCents))
    assert.ok(priceCentsSet.has(500))
    assert.ok(priceCentsSet.has(600))
    assert.ok(priceCentsSet.has(700))
    assert.ok(priceCentsSet.has(800))
    assert.ok(
      skus.some(
        (s) =>
          String(s.specCombination).includes('杯型:') &&
          String(s.specCombination).includes('小杯') &&
          String(s.specCombination).includes('大杯')
      )
    )

    const detail = await fetch(`${base}/api/v1/goods/${goodId}`)
    assert.equal(detail.status, 200)
    const detailJson = await detail.json()
    assert.equal(detailJson.data.minPriceCents, 500)
    assert.equal(detailJson.data.basePriceCents, 500)
    assert.equal(detailJson.data.optionGroups.length, 2)
  })
})

test('optionGroups validates selection limits', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const resp = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_BAD_${Date.now()}`,
        optionGroups: [
          {
            id: `og_bad_${Date.now()}`,
            name: '加料',
            isRequired: true,
            minSelection: 1,
            maxSelection: 2,
            options: [{ id: 'a', name: '珍珠', priceCents: 100 }]
          }
        ]
      })
    })
    assert.equal(resp.status, 400)
    const json = await resp.json()
    assert.equal(json.success, false)

    const suf = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const ok1 = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_OK1_${suf}`,
        optionGroups: [
          {
            id: `og_ok1_${suf}`,
            name: '加料',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: `b1_${suf}`, name: '珍珠', priceCents: 100 },
              { id: `b2_${suf}`, name: '椰果', priceCents: 100 }
            ]
          }
        ]
      })
    })
    assert.equal(ok1.status, 201)

    const okMax = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_OKMAX_${suf}`,
        optionGroups: [
          {
            id: `og_okmax_${suf}`,
            name: '加料',
            isRequired: true,
            minSelection: 1,
            maxSelection: 3,
            options: [
              { id: `c1_${suf}`, name: '珍珠', priceCents: 100 },
              { id: `c2_${suf}`, name: '椰果', priceCents: 100 },
              { id: `c3_${suf}`, name: '布丁', priceCents: 100 }
            ]
          }
        ]
      })
    })
    assert.equal(okMax.status, 201)

    const mid = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_MID_${suf}`,
        optionGroups: [
          {
            id: `og_mid_${suf}`,
            name: '加料',
            isRequired: true,
            minSelection: 1,
            maxSelection: 2,
            options: [
              { id: `d1_${suf}`, name: '珍珠', priceCents: 100 },
              { id: `d2_${suf}`, name: '椰果', priceCents: 100 },
              { id: `d3_${suf}`, name: '布丁', priceCents: 100 }
            ]
          }
        ]
      })
    })
    assert.equal(mid.status, 201)
  })
})

test('optionGroups supports defaultOptionIds per group', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const og1 = `og1_${suffix}`
    const op1 = `op1_${suffix}`
    const op2 = `op2_${suffix}`
    const og2 = `og2_${suffix}`
    const op3 = `op3_${suffix}`

    const create = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_DEFOPT_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500,
        optionGroups: [
          {
            id: og1,
            name: '加料',
            isRequired: false,
            minSelection: 0,
            maxSelection: 2,
            defaultOptionIds: [op1, op2],
            options: [
              { id: op1, name: '珍珠', priceCents: 100 },
              { id: op2, name: '椰果', priceCents: 200 }
            ]
          },
          {
            id: og2,
            name: '甜度',
            isStock: false,
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            defaultOptionIds: [op3],
            options: [{ id: op3, name: '正常糖', priceCents: 0 }]
          }
        ]
      })
    })
    assert.equal(create.status, 201)
    const goodId = (await create.json()).data.goodId

    const detail = await fetch(`${base}/api/v1/goods/${goodId}`)
    assert.equal(detail.status, 200)
    const json = await detail.json()
    const groups = json.data.optionGroups
    const g1 = groups.find((g) => g.id === og1)
    const g2 = groups.find((g) => g.id === og2)
    assert.deepEqual(g1.defaultOptionIds.sort(), [op1, op2].sort())
    assert.deepEqual(g2.defaultOptionIds, [op3])

    const bad = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        optionGroups: [
          {
            id: og1,
            name: '加料',
            isRequired: false,
            minSelection: 0,
            maxSelection: 2,
            defaultOptionIds: ['not_exist'],
            options: [
              { id: op1, name: '珍珠', priceCents: 100 },
              { id: op2, name: '椰果', priceCents: 200 }
            ]
          },
          {
            id: og2,
            name: '甜度',
            isStock: false,
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            defaultOptionIds: [op3],
            options: [{ id: op3, name: '正常糖', priceCents: 0 }]
          }
        ]
      })
    })
    assert.equal(bad.status, 400)
  })
})

test('creates default sku when no optionGroups', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const createGood1 = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_DEF1_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500
      })
    })
    assert.equal(createGood1.status, 201)
    const goodId1 = (await createGood1.json()).data.goodId

    const skuList1 = await fetch(`${base}/api/v1/skus?goodId=${goodId1}`, { headers: authz })
    assert.equal(skuList1.status, 200)
    const skuJson1 = await skuList1.json()
    assert.equal(skuJson1.data.list.length, 1)
    assert.equal(skuJson1.data.list[0].specCombination, '默认')
    assert.equal(skuJson1.data.list[0].priceCents, 500)

    const createGood2 = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_DEF2_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 600,
        optionGroups: []
      })
    })
    assert.equal(createGood2.status, 201)
    const goodId2 = (await createGood2.json()).data.goodId

    const skuList2 = await fetch(`${base}/api/v1/skus?goodId=${goodId2}`, { headers: authz })
    assert.equal(skuList2.status, 200)
    const skuJson2 = await skuList2.json()
    assert.equal(skuJson2.data.list.length, 1)
    assert.equal(skuJson2.data.list[0].specCombination, '默认')
    assert.equal(skuJson2.data.list[0].priceCents, 600)
  })
})

test('basePriceCents must be non-negative integer', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const resp = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: 'cat_test', name: `G_BP_${Date.now()}`, basePriceCents: -1 })
    })
    assert.equal(resp.status, 400)
  })
})

test('minPriceCents is 0 when no skus', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base, AppDataSource }) => {
    const goodId = `good_empty_${suffix}`
    const goodRepo = AppDataSource.getRepository(require('../dist/entities/Good').Good)
    await goodRepo.save(
      goodRepo.create({
        goodId,
        storeId: 'store_default',
        categoryId: 'cat_test',
        name: `G_${suffix}`,
        description: '',
        sales: 0,
        status: 'ON_SHELF'
      })
    )

    const detail = await fetch(`${base}/api/v1/goods/${goodId}`)
    assert.equal(detail.status, 200)
    const json = await detail.json()
    assert.equal(json.data.minPriceCents, 0)
  })
})

test('minPrice includes required non-stock option minimum', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const resp = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_MIN_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500,
        optionGroups: [
          {
            id: `og_stock_${suffix}`,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: `op_stock_1_${suffix}`, name: '中杯', priceCents: 0 },
              { id: `op_stock_2_${suffix}`, name: '大杯', priceCents: 100 }
            ]
          },
          {
            id: `og_add_${suffix}`,
            name: '加料',
            isStock: false,
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: `op_add_1_${suffix}`, name: '珍珠', priceCents: 50 },
              { id: `op_add_2_${suffix}`, name: '椰果', priceCents: 80 }
            ]
          }
        ]
      })
    })
    assert.equal(resp.status, 201)
    const goodId = (await resp.json()).data.goodId

    const detail = await fetch(`${base}/api/v1/goods/${goodId}`)
    assert.equal(detail.status, 200)
    const detailJson = await detail.json()
    assert.equal(detailJson.data.minPriceCents, 550)

    const list = await fetch(`${base}/api/v1/goods?categoryId=cat_test&status=ON_SHELF&page=1&pageSize=50`)
    assert.equal(list.status, 200)
    const listJson = await list.json()
    const row = listJson.data.list.find((x) => x.goodId === goodId)
    assert.equal(row.minPriceCents, 550)
  })
})
