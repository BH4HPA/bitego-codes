const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz } = require('./testUtils')

test('basePrice change reprices existing SKUs without rebuild', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const ogId = `og1_${suffix}`
    const op1 = `op1_${suffix}`
    const op2 = `op2_${suffix}`

    const createGood = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_BASE_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500,
        optionGroups: [
          {
            id: ogId,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: op1, name: '小杯', priceCents: 0 },
              { id: op2, name: '大杯', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(createGood.status, 201)
    const goodId = (await createGood.json()).data.goodId

    const skuList1 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList1.status, 200)
    const skus1 = (await skuList1.json()).data.list
    assert.equal(skus1.length, 2)
    const before = new Map(skus1.map((s) => [s.skuId, s.priceCents]))

    const put = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        basePriceCents: 600,
        optionGroups: [
          {
            id: ogId,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: op1, name: '小杯', priceCents: 0 },
              { id: op2, name: '大杯', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(put.status, 200)
    const putJson = await put.json()
    assert.equal(putJson.data.skuRebuild.skuRebuilt, false)
    assert.equal(putJson.data.skuRebuild.skuPriceUpdatedCount, 2)

    const skuList2 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList2.status, 200)
    const skus2 = (await skuList2.json()).data.list
    assert.equal(skus2.length, 2)
    for (const s of skus2) {
      assert.equal(before.has(s.skuId), true)
      assert.equal(s.priceCents, before.get(s.skuId) + 100)
    }
  })
})

test('basePrice change with optionGroups fixes corrupted SKU prices by absolute repricing', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base, AppDataSource }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const ogId = `og1_${suffix}`
    const op1 = `op1_${suffix}`
    const op2 = `op2_${suffix}`

    const createGood = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_CORR_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 1300,
        optionGroups: [
          {
            id: ogId,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: op1, name: '小杯', priceCents: 0 },
              { id: op2, name: '大杯', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(createGood.status, 201)
    const goodId = (await createGood.json()).data.goodId

    const skuList1 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList1.status, 200)
    const skus1 = (await skuList1.json()).data.list
    assert.equal(skus1.length, 2)

    const skuRepo = AppDataSource.getRepository(require('../dist/entities/SKU').SKU)
    await skuRepo.update({ skuId: skus1[0].skuId }, { price: '130200' })

    const put = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        basePriceCents: 1700,
        optionGroups: [
          {
            id: ogId,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: op1, name: '小杯', priceCents: 0 },
              { id: op2, name: '大杯', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(put.status, 200)

    const skuList2 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList2.status, 200)
    const skus2 = (await skuList2.json()).data.list
    const small = skus2.find((s) => String(s.specCombination).includes('小杯'))
    const big = skus2.find((s) => String(s.specCombination).includes('大杯'))
    assert.ok(small)
    assert.ok(big)
    assert.equal(small.priceCents, 1700)
    assert.equal(big.priceCents, 1900)
  })
})

test('option price change reprices SKUs without rebuild and keeps stock/status', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const ogId = `og_${suffix}`
    const op1 = `op_${suffix}_1`
    const op2 = `op_${suffix}_2`
    const createGood = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_OPT_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500,
        optionGroups: [
          {
            id: ogId,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: op1, name: '小杯', priceCents: 0 },
              { id: op2, name: '大杯', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(createGood.status, 201)
    const goodId = (await createGood.json()).data.goodId

    const skuList1 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList1.status, 200)
    const skus1 = (await skuList1.json()).data.list
    assert.equal(skus1.length, 2)

    const one = skus1.find((s) => String(s.specCombination).includes('大杯'))
    assert.ok(one)
    const updSku = await fetch(`${base}/api/v1/skus/${one.skuId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ stock: 7, status: 'ON_SHELF' })
    })
    assert.equal(updSku.status, 200)

    const put = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        optionGroups: [
          {
            id: ogId,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: op1, name: '小杯', priceCents: 0 },
              { id: op2, name: '大杯', priceCents: 300 }
            ]
          }
        ]
      })
    })
    assert.equal(put.status, 200)
    const putJson = await put.json()
    assert.equal(putJson.data.skuRebuild.skuRebuilt, false)

    const skuList2 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList2.status, 200)
    const skus2 = (await skuList2.json()).data.list
    assert.equal(skus2.length, 2)

    const afterBig = skus2.find((s) => String(s.specCombination).includes('大杯'))
    assert.ok(afterBig)
    assert.equal(afterBig.skuId, one.skuId)
    assert.equal(afterBig.stock, 7)
    assert.equal(afterBig.status, 'ON_SHELF')
    assert.equal(afterBig.priceCents, 800)
  })
})

test('basePrice change works with mixed stock/non-stock optionGroups without rebuild', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')

    const stockG = `og_stock_${suffix}`
    const stockO1 = `op_s1_${suffix}`
    const stockO2 = `op_s2_${suffix}`
    const nonStockG = `og_non_${suffix}`
    const nonO1 = `op_n1_${suffix}`
    const nonO2 = `op_n2_${suffix}`

    const createGood = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_MIX_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 0,
        optionGroups: [
          {
            id: stockG,
            name: '杯型',
            sort: 20,
            isStock: true,
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: stockO1, name: '大杯', priceCents: 400 },
              { id: stockO2, name: '中杯', priceCents: 0 }
            ]
          },
          {
            id: nonStockG,
            name: '甜度',
            sort: 10,
            isStock: false,
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: nonO1, name: '七分甜', priceCents: 100 },
              { id: nonO2, name: '三分糖', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(createGood.status, 201)
    const goodId = (await createGood.json()).data.goodId

    const skuList1 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList1.status, 200)
    const skus1 = (await skuList1.json()).data.list
    assert.equal(skus1.length, 2)
    const before = new Map(skus1.map((s) => [s.skuId, s.priceCents]))

    const put = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        basePriceCents: 1000,
        optionGroups: [
          {
            id: stockG,
            name: '杯型',
            sort: 20,
            isStock: true,
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: stockO1, name: '大杯', priceCents: 400 },
              { id: stockO2, name: '中杯', priceCents: 0 }
            ]
          },
          {
            id: nonStockG,
            name: '甜度',
            sort: 10,
            isStock: false,
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
            options: [
              { id: nonO1, name: '七分甜', priceCents: 100 },
              { id: nonO2, name: '三分糖', priceCents: 200 }
            ]
          }
        ]
      })
    })
    assert.equal(put.status, 200)
    const putJson = await put.json()
    assert.equal(putJson.data.skuRebuild.skuRebuilt, false)
    assert.equal(putJson.data.skuRebuild.skuPriceUpdatedCount, 2)

    const skuList2 = await fetch(`${base}/api/v1/skus?goodId=${goodId}`, { headers: authz })
    assert.equal(skuList2.status, 200)
    const skus2 = (await skuList2.json()).data.list
    assert.equal(skus2.length, 2)
    for (const s of skus2) {
      assert.equal(before.has(s.skuId), true)
      assert.equal(s.priceCents, before.get(s.skuId) + 1000)
    }
  })
})
