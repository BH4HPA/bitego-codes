const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz } = require('./testUtils')

async function listSkus(base, authz, goodId) {
  const resp = await fetch(`${base}/api/v1/skus?goodId=${encodeURIComponent(goodId)}`, { headers: authz })
  assert.equal(resp.status, 200)
  const json = await resp.json()
  return json.data.list
}

test('changing optionGroups rebuilds all SKUs and clears stock/price settings', async () => {
  await withServer(async ({ base, AppDataSource }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`

    const create = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_REBUILD_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500,
        optionGroups: [
          {
            id: `og1_${suffix}`,
            name: '杯型',
            isRequired: true,
            minSelection: 1,
            maxSelection: 1,
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
              { id: `op3_${suffix}`, name: '不加糖', priceCents: 0 },
              { id: `op4_${suffix}`, name: '半糖', priceCents: 100 }
            ]
          }
        ]
      })
    })
    assert.equal(create.status, 201)
    const goodId = (await create.json()).data.goodId

    const skus1 = await listSkus(base, authz, goodId)
    assert.equal(skus1.length, 4)
    const oldSkuIds = new Set(skus1.map((s) => s.skuId))

    const oneSku = skus1[0]
    const updSku = await fetch(`${base}/api/v1/skus/${oneSku.skuId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ stock: 7, priceCents: 999, status: 'ON_SHELF' })
    })
    assert.equal(updSku.status, 200)

    const put = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        optionGroups: [
          {
            id: `og1_${suffix}`,
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
    assert.equal(put.status, 200)
    const putJson = await put.json()
    assert.equal(putJson.data.skuRebuild.skuRebuilt, true)
    assert.ok(putJson.data.skuRebuild.skuDeletedCount >= 4)
    assert.equal(putJson.data.skuRebuild.skuCreatedCount, 2)

    const skus2 = await listSkus(base, authz, goodId)
    assert.equal(skus2.length, 2)
    for (const s of skus2) {
      assert.equal(oldSkuIds.has(s.skuId), false)
      assert.equal(s.stock, 0)
      assert.equal(s.status, 'OFF_SHELF')
      assert.ok(Number(s.priceCents) === 500 || Number(s.priceCents) === 700)
    }

    const { GoodSpecChangeLog } = require('../dist/entities/GoodSpecChangeLog')
    const logs = await AppDataSource.getRepository(GoodSpecChangeLog).find({ where: { goodId } })
    assert.ok(logs.length >= 1)
    const before = JSON.parse(String(logs[0].beforeSnapshot || '[]'))
    const after = JSON.parse(String(logs[0].afterSnapshot || '[]'))
    assert.ok(Array.isArray(before))
    assert.ok(Array.isArray(after))
    assert.notDeepEqual(before, after)
  })
})

test('changing optionGroups to empty regenerates default SKU', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`

    const create = await fetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_EMPTY_${suffix}`,
        status: 'ON_SHELF',
        basePriceCents: 500,
        optionGroups: [
          {
            id: `og1_${suffix}`,
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
    assert.equal(create.status, 201)
    const goodId = (await create.json()).data.goodId
    const skus1 = await listSkus(base, authz, goodId)
    assert.equal(skus1.length, 2)

    const put = await fetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ optionGroups: [] })
    })
    assert.equal(put.status, 200)

    const skus2 = await listSkus(base, authz, goodId)
    assert.equal(skus2.length, 1)
    assert.equal(skus2[0].specCombination, '默认')
    assert.equal(Number(skus2[0].priceCents), 500)
  })
})
