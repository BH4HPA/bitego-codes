const test = require('node:test')
const assert = require('node:assert/strict')
const { withServer, getAuthz, jsonFetch } = require('./testUtils')

test('shared spec groups CRUD and delete constraint', async () => {
  await withServer(async ({ base }) => {
    const authz = await getAuthz(base, 'ADMIN')
    const suffix = String(Date.now())

    const { resp: badCreateResp } = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', options: [] })
    })
    assert.equal(badCreateResp.status, 400)

    const opt1 = `sso_${suffix}_1`
    const opt2 = `sso_${suffix}_2`
    const { resp: createResp, json: createJson } = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `加料_${suffix}`,
        description: `提示_${suffix}`,
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        defaultOptionIds: [opt1],
        options: [
          { id: opt1, name: '珍珠', priceCents: 100 },
          { id: opt2, name: '椰果', priceCents: 200 }
        ]
      })
    })
    assert.equal(createResp.status, 201)
    const sharedSpecGroupId = createJson.data.sharedSpecGroupId
    assert.ok(sharedSpecGroupId)

    const { resp: listResp1, json: listJson1 } = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      headers: authz
    })
    assert.equal(listResp1.status, 200)
    const inList1 = listJson1.data.list.find((x) => x.sharedSpecGroupId === sharedSpecGroupId)
    assert.ok(inList1)
    assert.equal(inList1.description, `提示_${suffix}`)
    assert.equal(inList1.goodsCount, 0)
    assert.ok(Array.isArray(inList1.options))
    assert.equal(inList1.options.length, 2)

    const { resp: detailResp1, json: detailJson1 } = await jsonFetch(
      `${base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`,
      { headers: authz }
    )
    assert.equal(detailResp1.status, 200)
    assert.equal(detailJson1.data.sharedSpecGroupId, sharedSpecGroupId)
    assert.equal(detailJson1.data.description, `提示_${suffix}`)
    assert.ok(Array.isArray(detailJson1.data.goods))
    assert.equal(detailJson1.data.goods.length, 0)
    assert.equal(detailJson1.data.options.length, 2)

    const opt3 = `sso_${suffix}_3`
    const { resp: updResp1 } = await jsonFetch(`${base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `加料2_${suffix}`,
        description: `提示2_${suffix}`,
        isRequired: false,
        minSelection: 0,
        maxSelection: 2,
        defaultOptionIds: [opt2, opt3],
        options: [
          { id: opt2, name: '椰果', priceCents: 200 },
          { id: opt3, name: '布丁', priceCents: 300 }
        ]
      })
    })
    assert.equal(updResp1.status, 200)

    const { resp: detailResp2, json: detailJson2 } = await jsonFetch(
      `${base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`,
      { headers: authz }
    )
    assert.equal(detailResp2.status, 200)
    assert.equal(detailJson2.data.name, `加料2_${suffix}`)
    assert.equal(detailJson2.data.description, `提示2_${suffix}`)
    assert.equal(detailJson2.data.isRequired, false)
    assert.equal(detailJson2.data.minSelection, 0)
    assert.equal(detailJson2.data.maxSelection, 2)
    assert.deepEqual(detailJson2.data.defaultOptionIds, [opt2, opt3])
    assert.equal(detailJson2.data.options.length, 2)
    assert.ok(detailJson2.data.options.some((o) => o.id === opt2))
    assert.ok(detailJson2.data.options.some((o) => o.id === opt3))

    const { resp: createGoodResp, json: createGoodJson } = await jsonFetch(`${base}/api/v1/goods`, {
      method: 'POST',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({
        categoryId: 'cat_test',
        name: `G_${suffix}`,
        status: 'OFF_SHELF',
        basePriceCents: 1000,
        optionGroups: [{ id: sharedSpecGroupId, sharedSpecGroupId, groupType: 'shared', sort: 10 }]
      })
    })
    assert.equal(createGoodResp.status, 201)
    const goodId = createGoodJson.data.goodId
    assert.ok(goodId)

    const { resp: listResp2, json: listJson2 } = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      headers: authz
    })
    assert.equal(listResp2.status, 200)
    const inList2 = listJson2.data.list.find((x) => x.sharedSpecGroupId === sharedSpecGroupId)
    assert.ok(inList2)
    assert.equal(inList2.goodsCount, 1)

    const { resp: detailResp3, json: detailJson3 } = await jsonFetch(
      `${base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`,
      { headers: authz }
    )
    assert.equal(detailResp3.status, 200)
    assert.ok(detailJson3.data.goods.some((g) => g.goodId === goodId))

    const { resp: delInUseResp, json: delInUseJson } = await jsonFetch(
      `${base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`,
      {
        method: 'DELETE',
        headers: authz
      }
    )
    assert.equal(delInUseResp.status, 400)
    assert.equal(delInUseJson.code, 40000)

    const { resp: unbindResp } = await jsonFetch(`${base}/api/v1/goods/${goodId}`, {
      method: 'PUT',
      headers: { ...authz, 'content-type': 'application/json' },
      body: JSON.stringify({ optionGroups: [] })
    })
    assert.equal(unbindResp.status, 200)

    const { resp: delOkResp } = await jsonFetch(`${base}/api/v1/shared-spec-groups/${sharedSpecGroupId}`, {
      method: 'DELETE',
      headers: authz
    })
    assert.equal(delOkResp.status, 200)

    const { resp: listResp3, json: listJson3 } = await jsonFetch(`${base}/api/v1/shared-spec-groups`, {
      headers: authz
    })
    assert.equal(listResp3.status, 200)
    assert.ok(!listJson3.data.list.some((x) => x.sharedSpecGroupId === sharedSpecGroupId))
  })
})
