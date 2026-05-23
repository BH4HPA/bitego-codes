const test = require('node:test')
const assert = require('node:assert/strict')

test('SkuGenerator supports maxSelection boundary cases', () => {
  const { SkuGenerator } = require('../dist/services/skuGenerator')

  const base = {
    id: 'og1',
    name: '加料',
    isRequired: true,
    options: [
      { id: 'o1', name: '珍珠', priceCents: 0n },
      { id: 'o2', name: '椰果', priceCents: 0n },
      { id: 'o3', name: '布丁', priceCents: 0n }
    ]
  }

  assert.ok(SkuGenerator.validateOptionGroups([{ ...base, minSelection: 1, maxSelection: 1 }]).ok)
  assert.ok(SkuGenerator.validateOptionGroups([{ ...base, minSelection: 1, maxSelection: 2 }]).ok)
  assert.ok(SkuGenerator.validateOptionGroups([{ ...base, minSelection: 1, maxSelection: 3 }]).ok)
  assert.equal(SkuGenerator.validateOptionGroups([{ ...base, minSelection: 1, maxSelection: 4 }]).ok, false)
})

test('SkuGenerator generates correct combinations for multi-select group', () => {
  const { SkuGenerator } = require('../dist/services/skuGenerator')
  const basePriceCents = 500n
  const groups = [
    {
      id: 'og1',
      name: '加料',
      isRequired: true,
      minSelection: 1,
      maxSelection: 2,
      options: [
        { id: 'o1', name: '珍珠', priceCents: 100n },
        { id: 'o2', name: '椰果', priceCents: 200n },
        { id: 'o3', name: '布丁', priceCents: 300n }
      ]
    }
  ]

  const out = SkuGenerator.generate(basePriceCents, groups)
  assert.equal(out.length, 6)
  const keys = new Set(out.map((s) => s.specKey))
  assert.equal(keys.size, out.length)

  const specTexts = new Set(out.map((s) => s.specText))
  assert.ok(specTexts.has('加料:珍珠'))
  assert.ok(specTexts.has('加料:椰果'))
  assert.ok(specTexts.has('加料:布丁'))
  assert.ok(specTexts.has('加料:珍珠、椰果'))
  assert.ok(specTexts.has('加料:珍珠、布丁'))
  assert.ok(specTexts.has('加料:椰果、布丁'))

  const priceSet = new Set(out.map((s) => s.priceCents))
  assert.ok(priceSet.has(600n))
  assert.ok(priceSet.has(700n))
  assert.ok(priceSet.has(800n))
  assert.ok(priceSet.has(900n))
  assert.ok(priceSet.has(1000n))
})
