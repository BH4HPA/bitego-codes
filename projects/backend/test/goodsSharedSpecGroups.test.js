const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('goods binds shared non-stock groups and affects minPrice', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = String(Date.now())

    const optA = `sso_${suffix}_a`
    const optB = `sso_${suffix}_b`
    const { resp: createSsgResp, json: createSsgJson } = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `必选加料_${suffix}`,
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        defaultOptionIds: [optA],
        options: [
          { id: optA, name: '珍珠', priceCents: 100 },
          { id: optB, name: '布丁', priceCents: 250 }
        ]
      })
    })
    assert.equal(createSsgResp.status, 201)
    const sharedSpecGroupId = createSsgJson.data.sharedSpecGroupId
    assert.ok(sharedSpecGroupId)

    const { resp: badGoodResp } = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `Bad_${suffix}`,
        status: 'OFF_SHELF',
        basePriceCents: 1000,
        optionGroups: [{ id: 'ssg_not_exist', sharedSpecGroupId: 'ssg_not_exist', groupType: 'shared', sort: 10 }]
      })
    })
    assert.equal(badGoodResp.status, 400)

    const basePriceCents = 1000
    const { resp: badDisableAllResp } = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `BadDisableAll_${suffix}`,
        status: 'OFF_SHELF',
        basePriceCents,
        optionGroups: [
          { id: sharedSpecGroupId, sharedSpecGroupId, groupType: 'shared', sort: 10, disabledOptionIds: [optA, optB] }
        ]
      })
    })
    assert.equal(badDisableAllResp.status, 400)

    const { resp: createGoodResp1, json: createGoodJson1 } = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G1_${suffix}`,
        status: 'OFF_SHELF',
        basePriceCents,
        optionGroups: [
          { id: sharedSpecGroupId, sharedSpecGroupId, groupType: 'shared', sort: 10, disabledOptionIds: [optA] }
        ]
      })
    })
    assert.equal(createGoodResp1.status, 201)
    const goodId1 = createGoodJson1.data.goodId
    assert.ok(goodId1)

    const { resp: detailResp, json: detailJson } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`, {
      headers: authz
    })
    assert.equal(detailResp.status, 200)
    const og = detailJson.data.optionGroups.find(
      (x) => x.sharedSpecGroupId === sharedSpecGroupId || x.id === sharedSpecGroupId
    )
    assert.ok(og)
    assert.equal(og.groupType, 'shared')
    assert.equal(og.sharedSpecGroupId, sharedSpecGroupId)
    assert.equal(og.isStock, false)
    assert.equal(og.isRequired, true)
    assert.ok(Array.isArray(og.options))
    assert.equal(og.options.length, 2)
    assert.deepEqual(og.disabledOptionIds, [optA])

    const { resp: publicDetailResp, json: publicDetailJson } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`)
    assert.equal(publicDetailResp.status, 200)
    const pog = publicDetailJson.data.optionGroups.find(
      (x) => x.sharedSpecGroupId === sharedSpecGroupId || x.id === sharedSpecGroupId
    )
    assert.ok(pog)
    assert.equal(pog.options.length, 1)
    assert.ok(pog.options.every((x) => x.id !== optA))

    const { resp: listResp0, json: listJson0 } = await jsonFetch(
      `${base}/api/v1/goods?page=1&pageSize=50&status=OFF_SHELF`,
      { headers: authz }
    )
    assert.equal(listResp0.status, 200)
    const item0 = listJson0.data.list.find((x) => x.goodId === goodId1)
    assert.ok(item0)
    assert.equal(item0.minPriceCents, basePriceCents + 250)

    const { resp: badUpdDisableResp } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        optionGroups: [
          {
            id: sharedSpecGroupId,
            sharedSpecGroupId,
            groupType: 'shared',
            sort: 10,
            disabledOptionIds: ['opt_not_exist']
          }
        ]
      })
    })
    assert.equal(badUpdDisableResp.status, 400)

    const { resp: badUpdDefaultResp } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        optionGroups: [
          {
            id: sharedSpecGroupId,
            sharedSpecGroupId,
            groupType: 'shared',
            sort: 10,
            disabledOptionIds: [optA],
            defaultOptionIds: [optA]
          }
        ]
      })
    })
    assert.equal(badUpdDefaultResp.status, 400)

    const { resp: okUpdResp } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        optionGroups: [
          {
            id: sharedSpecGroupId,
            sharedSpecGroupId,
            groupType: 'shared',
            sort: 10,
            disabledOptionIds: [],
            defaultOptionIds: [optA]
          }
        ]
      })
    })
    assert.equal(okUpdResp.status, 200)

    const { resp: detailResp1b, json: detailJson1b } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`, {
      headers: authz
    })
    assert.equal(detailResp1b.status, 200)
    const og1b = detailJson1b.data.optionGroups.find(
      (x) => x.sharedSpecGroupId === sharedSpecGroupId || x.id === sharedSpecGroupId
    )
    assert.ok(og1b)
    assert.deepEqual(og1b.disabledOptionIds, [])
    assert.deepEqual(og1b.linkDefaultOptionIds, [optA])

    const { resp: listResp, json: listJson } = await jsonFetch(
      `${base}/api/v1/goods?page=1&pageSize=50&status=OFF_SHELF`,
      { headers: authz }
    )
    assert.equal(listResp.status, 200)
    const item1 = listJson.data.list.find((x) => x.goodId === goodId1)
    assert.ok(item1)
    assert.equal(item1.basePriceCents, basePriceCents)
    assert.equal(item1.minPriceCents, basePriceCents + 100)

    const { resp: createGoodResp2, json: createGoodJson2 } = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G2_${suffix}`,
        status: 'OFF_SHELF',
        basePriceCents,
        optionGroups: [
          { id: sharedSpecGroupId, sharedSpecGroupId, groupType: 'shared', sort: 10, defaultOptionIds: [optB] }
        ]
      })
    })
    assert.equal(createGoodResp2.status, 201)
    const goodId2 = createGoodJson2.data.goodId
    assert.ok(goodId2)

    const { resp: detailResp2a, json: detailJson2a } = await jsonFetch(`${base}/api/v1/goods/${goodId2}`, {
      headers: authz
    })
    assert.equal(detailResp2a.status, 200)
    const og2a = detailJson2a.data.optionGroups.find(
      (x) => x.sharedSpecGroupId === sharedSpecGroupId || x.id === sharedSpecGroupId
    )
    assert.ok(og2a)
    assert.deepEqual(og2a.linkDefaultOptionIds, [optB])
    assert.deepEqual(og2a.defaultOptionIds, [optB])

    const { resp: updGroupResp } = await jsonFetch(`${base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `必选加料_${suffix}`,
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        defaultOptionIds: [optA],
        options: [{ id: optA, name: '珍珠', priceCents: 100 }]
      })
    })
    assert.equal(updGroupResp.status, 200)

    const { resp: detailResp2b, json: detailJson2b } = await jsonFetch(`${base}/api/v1/goods/${goodId2}`, {
      headers: authz
    })
    assert.equal(detailResp2b.status, 200)
    const og2b = detailJson2b.data.optionGroups.find(
      (x) => x.sharedSpecGroupId === sharedSpecGroupId || x.id === sharedSpecGroupId
    )
    assert.ok(og2b)
    assert.deepEqual(og2b.linkDefaultOptionIds, [])
    assert.deepEqual(og2b.defaultOptionIds, [optA])
    assert.equal(og2b.options.length, 1)
    assert.equal(og2b.options[0].id, optA)

    const { resp: listResp2, json: listJson2 } = await jsonFetch(
      `${base}/api/v1/goods?page=1&pageSize=50&status=OFF_SHELF`,
      { headers: authz }
    )
    assert.equal(listResp2.status, 200)
    const item2 = listJson2.data.list.find((x) => x.goodId === goodId2)
    assert.ok(item2)
    assert.equal(item2.minPriceCents, basePriceCents + 100)

    const { resp: unbindResp } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ optionGroups: [] })
    })
    assert.equal(unbindResp.status, 200)

    const { resp: detailResp3, json: detailJson3 } = await jsonFetch(`${base}/api/v1/goods/${goodId1}`, {
      headers: authz
    })
    assert.equal(detailResp3.status, 200)
    assert.ok(
      !detailJson3.data.optionGroups.some(
        (x) => x.sharedSpecGroupId === sharedSpecGroupId || x.id === sharedSpecGroupId
      )
    )
  })
})
