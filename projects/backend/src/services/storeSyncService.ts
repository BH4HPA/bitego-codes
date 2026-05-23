import { EntityManager, In } from 'typeorm'
import { Category } from '../entities/Category'
import { Good } from '../entities/Good'
import { GoodCategory } from '../entities/GoodCategory'
import { GoodSharedSpecGroup } from '../entities/GoodSharedSpecGroup'
import { SharedSpecGroup } from '../entities/SharedSpecGroup'
import { SharedSpecOption } from '../entities/SharedSpecOption'
import { SpecGroup } from '../entities/SpecGroup'
import { SpecOption } from '../entities/SpecOption'
import { SKU } from '../entities/SKU'
import { genId } from '../utils/id'
import { SkuGenerator } from './skuGenerator'

export type SharedCatalogSyncResult = {
  categoryCreated: number
  categoryUpdated: number
  sharedSpecGroupCreated: number
  sharedSpecGroupUpdated: number
  sharedSpecOptionCreated: number
  sharedSpecOptionUpdated: number
  goodCreated: number
  goodUpdated: number
  skuCreated: number
  created: {
    categories: Array<{ templateId: string; name: string }>
    sharedSpecGroups: Array<{ templateId: string; name: string }>
    goods: Array<{ templateId: string; name: string }>
  }
  updated: {
    categories: Array<{ templateId: string; name: string }>
    sharedSpecGroups: Array<{ templateId: string; name: string }>
    goods: Array<{ templateId: string; name: string }>
  }
}

export async function syncSharedCatalogForStore(params: {
  manager: EntityManager
  sourceStoreId: string
  targetStoreId: string
}): Promise<SharedCatalogSyncResult> {
  const { manager, sourceStoreId, targetStoreId } = params
  const catRepo = manager.getRepository(Category)
  const goodRepo = manager.getRepository(Good)
  const goodCatRepo = manager.getRepository(GoodCategory)
  const gssgRepo = manager.getRepository(GoodSharedSpecGroup)
  const ssgRepo = manager.getRepository(SharedSpecGroup)
  const ssoRepo = manager.getRepository(SharedSpecOption)
  const sgRepo = manager.getRepository(SpecGroup)
  const soRepo = manager.getRepository(SpecOption)
  const skuRepo = manager.getRepository(SKU)

  const srcCats = await catRepo.find({ where: { storeId: sourceStoreId } })
  const tgtCats = await catRepo.find({ where: { storeId: targetStoreId } })
  const tgtCatByTpl = new Map<string, Category>()
  const srcCatIdToTpl = new Map<string, string>()
  for (const c of tgtCats) {
    const tpl = c.templateId || c.categoryId
    tgtCatByTpl.set(tpl, c)
  }

  const createdCats: Array<{ templateId: string; name: string }> = []
  const updatedCats: Array<{ templateId: string; name: string }> = []
  const catToSave: Category[] = []
  let categoryCreated = 0
  let categoryUpdated = 0

  for (const src of srcCats) {
    const tpl = src.templateId || src.categoryId
    srcCatIdToTpl.set(src.categoryId, tpl)
    const existing = tgtCatByTpl.get(tpl)
    if (!existing) {
      const row = catRepo.create({
        categoryId: genId('cat'),
        storeId: targetStoreId,
        templateId: tpl,
        name: src.name,
        subtitle: src.subtitle,
        badgeText: src.badgeText,
        sort: src.sort,
        status: src.status
      })
      catToSave.push(row)
      categoryCreated += 1
      createdCats.push({ templateId: tpl, name: src.name })
      continue
    }
    const before = `${existing.name}|${existing.subtitle || ''}|${existing.badgeText || ''}|${existing.sort}|${existing.status}`
    existing.templateId = tpl
    existing.name = src.name
    existing.subtitle = src.subtitle
    existing.badgeText = src.badgeText
    existing.sort = src.sort
    existing.status = src.status
    const after = `${existing.name}|${existing.subtitle || ''}|${existing.badgeText || ''}|${existing.sort}|${existing.status}`
    if (before !== after) {
      catToSave.push(existing)
      categoryUpdated += 1
      updatedCats.push({ templateId: tpl, name: src.name })
    }
  }
  if (catToSave.length) await catRepo.save(catToSave)

  const srcGroups = await ssgRepo.find({ where: { storeId: sourceStoreId } })
  const tgtGroups = await ssgRepo.find({ where: { storeId: targetStoreId } })
  const tgtGroupByTpl = new Map<string, SharedSpecGroup>()
  for (const g of tgtGroups) {
    const tpl = g.templateId || g.sharedSpecGroupId
    tgtGroupByTpl.set(tpl, g)
  }

  const createdGroups: Array<{ templateId: string; name: string }> = []
  const updatedGroups: Array<{ templateId: string; name: string }> = []
  const groupToSave: SharedSpecGroup[] = []
  let sharedSpecGroupCreated = 0
  let sharedSpecGroupUpdated = 0
  const groupIdMap = new Map<string, { srcGroupId: string; tgtGroupId: string; tpl: string }>()
  const srcSharedGroupIdToTgtGroupId = new Map<string, string>()

  for (const src of srcGroups) {
    const tpl = src.templateId || src.sharedSpecGroupId
    const existing = tgtGroupByTpl.get(tpl)
    if (!existing) {
      const row = ssgRepo.create({
        sharedSpecGroupId: genId('ssg'),
        storeId: targetStoreId,
        templateId: tpl,
        name: src.name,
        description: src.description,
        isRequired: src.isRequired,
        minSelection: src.minSelection,
        maxSelection: src.maxSelection,
        sort: src.sort,
        defaultOptionIds: null,
        status: src.status
      })
      groupToSave.push(row)
      sharedSpecGroupCreated += 1
      createdGroups.push({ templateId: tpl, name: src.name })
      groupIdMap.set(tpl, { srcGroupId: src.sharedSpecGroupId, tgtGroupId: row.sharedSpecGroupId, tpl })
      srcSharedGroupIdToTgtGroupId.set(src.sharedSpecGroupId, row.sharedSpecGroupId)
      continue
    }
    const before = `${existing.name}|${existing.description || ''}|${existing.isRequired}|${existing.minSelection}|${existing.maxSelection}|${existing.sort}|${existing.status}`
    existing.templateId = tpl
    existing.name = src.name
    existing.description = src.description
    existing.isRequired = src.isRequired
    existing.minSelection = src.minSelection
    existing.maxSelection = src.maxSelection
    existing.sort = src.sort
    existing.status = src.status
    existing.defaultOptionIds = null
    const after = `${existing.name}|${existing.description || ''}|${existing.isRequired}|${existing.minSelection}|${existing.maxSelection}|${existing.sort}|${existing.status}`
    if (before !== after) {
      groupToSave.push(existing)
      sharedSpecGroupUpdated += 1
      updatedGroups.push({ templateId: tpl, name: src.name })
    }
    groupIdMap.set(tpl, { srcGroupId: src.sharedSpecGroupId, tgtGroupId: existing.sharedSpecGroupId, tpl })
    srcSharedGroupIdToTgtGroupId.set(src.sharedSpecGroupId, existing.sharedSpecGroupId)
  }
  if (groupToSave.length) await ssgRepo.save(groupToSave)

  const srcGroupIds = srcGroups.map((g) => g.sharedSpecGroupId)
  const srcOptions = srcGroupIds.length ? await ssoRepo.find({ where: { sharedSpecGroupId: In(srcGroupIds) } }) : []
  const srcOptionsByGroup = new Map<string, SharedSpecOption[]>()
  for (const o of srcOptions) {
    const arr = srcOptionsByGroup.get(o.sharedSpecGroupId) || []
    arr.push(o)
    srcOptionsByGroup.set(o.sharedSpecGroupId, arr)
  }

  const tgtGroupIds = Array.from(groupIdMap.values()).map((x) => x.tgtGroupId)
  const tgtOptions = tgtGroupIds.length ? await ssoRepo.find({ where: { sharedSpecGroupId: In(tgtGroupIds) } }) : []
  const tgtOptionsByGroup = new Map<string, SharedSpecOption[]>()
  for (const o of tgtOptions) {
    const arr = tgtOptionsByGroup.get(o.sharedSpecGroupId) || []
    arr.push(o)
    tgtOptionsByGroup.set(o.sharedSpecGroupId, arr)
  }

  const optionToSave: SharedSpecOption[] = []
  let sharedSpecOptionCreated = 0
  let sharedSpecOptionUpdated = 0
  for (const m of groupIdMap.values()) {
    const srcOpts = srcOptionsByGroup.get(m.srcGroupId) || []
    const tgtOpts = tgtOptionsByGroup.get(m.tgtGroupId) || []
    const tgtByTpl = new Map<string, SharedSpecOption>()
    for (const o of tgtOpts) {
      const tpl = o.templateId || o.optionId
      tgtByTpl.set(tpl, o)
    }
    for (const src of srcOpts) {
      const tpl = src.templateId || src.optionId
      const existing = tgtByTpl.get(tpl)
      if (!existing) {
        const row = ssoRepo.create({
          optionId: genId('sso'),
          sharedSpecGroupId: m.tgtGroupId,
          templateId: tpl,
          name: src.name,
          sort: src.sort,
          status: src.status
        })
        optionToSave.push(row)
        sharedSpecOptionCreated += 1
        continue
      }
      const before = `${existing.name}|${existing.sort}|${existing.status}`
      existing.templateId = tpl
      existing.name = src.name
      existing.sort = src.sort
      existing.status = src.status
      const after = `${existing.name}|${existing.sort}|${existing.status}`
      if (before !== after) {
        optionToSave.push(existing)
        sharedSpecOptionUpdated += 1
      }
    }
  }
  if (optionToSave.length) await ssoRepo.save(optionToSave)

  const tgtCatsAfter = await catRepo.find({ where: { storeId: targetStoreId } })
  const tgtCatIdByTpl = new Map<string, string>()
  for (const c of tgtCatsAfter) {
    const tpl = c.templateId || c.categoryId
    tgtCatIdByTpl.set(tpl, c.categoryId)
  }

  const srcGoods = await goodRepo.find({ where: { storeId: sourceStoreId } })
  const tgtGoods = await goodRepo.find({ where: { storeId: targetStoreId } })
  const tgtGoodByTpl = new Map<string, Good>()
  for (const g of tgtGoods) {
    const tpl = g.templateId || g.goodId
    tgtGoodByTpl.set(tpl, g)
  }

  const createdGoods: Array<{ templateId: string; name: string }> = []
  const updatedGoods: Array<{ templateId: string; name: string }> = []
  let goodCreated = 0
  let goodUpdated = 0
  let skuCreated = 0

  const srcGoodIds = srcGoods.map((g) => g.goodId)
  const srcGoodCatMaps = srcGoodIds.length
    ? await goodCatRepo.find({ where: { storeId: sourceStoreId, goodId: In(srcGoodIds) } })
    : []
  const srcCatsByGoodId = new Map<string, Array<{ categoryId: string; sort: number }>>()
  for (const m of srcGoodCatMaps) {
    const arr = srcCatsByGoodId.get(m.goodId) || []
    arr.push({ categoryId: m.categoryId, sort: Number(m.sort || 0) })
    srcCatsByGoodId.set(m.goodId, arr)
  }

  const srcGoodLinks = srcGoodIds.length
    ? await gssgRepo.find({ where: { storeId: sourceStoreId, goodId: In(srcGoodIds) } })
    : []
  const srcLinksByGoodId = new Map<string, GoodSharedSpecGroup[]>()
  for (const l of srcGoodLinks) {
    const arr = srcLinksByGoodId.get(l.goodId) || []
    arr.push(l)
    srcLinksByGoodId.set(l.goodId, arr)
  }

  const parseJsonIds = (raw: string | null) => {
    try {
      const parsed = raw ? JSON.parse(String(raw)) : []
      return Array.isArray(parsed) ? parsed.map((x) => String(x || '')).filter((x) => x) : []
    } catch {
      return []
    }
  }

  const srcSharedOptionTplByGroupIdByOptionId = new Map<string, Map<string, string>>()
  for (const [gid, opts] of srcOptionsByGroup.entries()) {
    const map = new Map<string, string>()
    for (const o of opts) map.set(o.optionId, o.templateId || o.optionId)
    srcSharedOptionTplByGroupIdByOptionId.set(gid, map)
  }
  const tgtSharedOptionIdByGroupIdByTpl = new Map<string, Map<string, string>>()
  for (const [gid, opts] of tgtOptionsByGroup.entries()) {
    const map = new Map<string, string>()
    for (const o of opts) map.set(o.templateId || o.optionId, o.optionId)
    tgtSharedOptionIdByGroupIdByTpl.set(gid, map)
  }
  const mapSharedOptionIds = (params: { srcGroupId: string; tgtGroupId: string; ids: string[] }) => {
    const tplById = srcSharedOptionTplByGroupIdByOptionId.get(params.srcGroupId) || new Map()
    const idByTpl = tgtSharedOptionIdByGroupIdByTpl.get(params.tgtGroupId) || new Map()
    return params.ids
      .map((id) => tplById.get(id) || null)
      .map((tpl) => (tpl ? idByTpl.get(tpl) || null : null))
      .filter((x): x is string => Boolean(x))
  }

  for (const src of srcGoods) {
    const tpl = src.templateId || src.goodId
    const existing = tgtGoodByTpl.get(tpl)
    if (existing) {
      const srcCatLinks = (srcCatsByGoodId.get(src.goodId) || []).sort((a, b) => b.sort - a.sort)
      const mappedCatIds = Array.from(
        new Set(
          srcCatLinks
            .map((x) => {
              const ct = srcCatIdToTpl.get(x.categoryId) || x.categoryId
              return tgtCatIdByTpl.get(ct) || null
            })
            .filter((x): x is string => Boolean(x))
        )
      )
      const primaryCatId =
        mappedCatIds[0] || tgtCatIdByTpl.get(srcCatIdToTpl.get(src.categoryId) || src.categoryId) || src.categoryId

      const before = `${existing.name}|${existing.description || ''}|${existing.detailMarkdown || ''}|${
        existing.imageUrls || ''
      }|${existing.basePrice || ''}|${existing.categoryId || ''}`
      existing.templateId = tpl
      existing.name = src.name
      existing.description = src.description
      existing.detailMarkdown = src.detailMarkdown
      existing.imageUrls = src.imageUrls
      existing.basePrice = src.basePrice
      existing.categoryId = primaryCatId
      const after = `${existing.name}|${existing.description || ''}|${existing.detailMarkdown || ''}|${
        existing.imageUrls || ''
      }|${existing.basePrice || ''}|${existing.categoryId || ''}`
      let updated = false
      if (before !== after) {
        await goodRepo.save(existing)
        updated = true
      }

      const catRows = mappedCatIds.length ? mappedCatIds : [primaryCatId]
      await goodCatRepo.delete({ storeId: targetStoreId, goodId: existing.goodId })
      if (catRows.length) {
        await goodCatRepo.insert(
          catRows.map((cid, idx) => ({
            storeId: targetStoreId,
            goodId: existing.goodId,
            categoryId: cid,
            sort: (catRows.length - idx) * 10
          }))
        )
      }

      const srcLinks = srcLinksByGoodId.get(src.goodId) || []
      const tgtLinks = await gssgRepo.find({ where: { storeId: targetStoreId, goodId: existing.goodId } })
      const tgtByGroupId = new Map(tgtLinks.map((x) => [x.sharedSpecGroupId, x]))
      const desiredGroupIds: string[] = []
      for (const l of srcLinks) {
        const tgtSharedGroupId = srcSharedGroupIdToTgtGroupId.get(l.sharedSpecGroupId)
        if (!tgtSharedGroupId) continue
        desiredGroupIds.push(tgtSharedGroupId)
        const disabled = mapSharedOptionIds({
          srcGroupId: l.sharedSpecGroupId,
          tgtGroupId: tgtSharedGroupId,
          ids: parseJsonIds((l as any).disabledOptionIds || null)
        })
        const defaults = mapSharedOptionIds({
          srcGroupId: l.sharedSpecGroupId,
          tgtGroupId: tgtSharedGroupId,
          ids: parseJsonIds((l as any).defaultOptionIds || null)
        })
        const row =
          tgtByGroupId.get(tgtSharedGroupId) ||
          gssgRepo.create({ storeId: targetStoreId, goodId: existing.goodId, sharedSpecGroupId: tgtSharedGroupId })
        row.sort = l.sort
        ;(row as any).disabledOptionIds = disabled.length ? JSON.stringify(disabled) : null
        ;(row as any).defaultOptionIds = defaults.length ? JSON.stringify(defaults) : null
        await gssgRepo.save(row)
      }
      const toRemove = tgtLinks
        .filter((x) => !desiredGroupIds.includes(x.sharedSpecGroupId))
        .map((x) => x.sharedSpecGroupId)
      if (toRemove.length) {
        await gssgRepo.delete({ storeId: targetStoreId, goodId: existing.goodId, sharedSpecGroupId: In(toRemove) })
      }

      const srcCustomGroups = await sgRepo.find({ where: { goodId: src.goodId } })
      const tgtCustomGroups = await sgRepo.find({ where: { goodId: existing.goodId } })
      const tgtGroupByTpl = new Map<string, SpecGroup>()
      for (const g of tgtCustomGroups) tgtGroupByTpl.set(g.templateId || g.specGroupId, g)

      for (const sg of srcCustomGroups) {
        const groupTpl = sg.templateId || sg.specGroupId
        const tgt = tgtGroupByTpl.get(groupTpl)
        const groupId = tgt ? tgt.specGroupId : genId('og')
        const groupRow =
          tgt ||
          sgRepo.create({
            specGroupId: groupId,
            templateId: groupTpl,
            goodId: existing.goodId,
            name: sg.name,
            isRequired: sg.isRequired,
            minSelection: sg.minSelection,
            maxSelection: sg.maxSelection,
            sort: sg.sort,
            isStock: sg.isStock,
            defaultOptionIds: null,
            status: sg.status
          })
        groupRow.templateId = groupTpl
        groupRow.goodId = existing.goodId
        groupRow.name = sg.name
        groupRow.isRequired = sg.isRequired
        groupRow.minSelection = sg.minSelection
        groupRow.maxSelection = sg.maxSelection
        groupRow.sort = sg.sort
        groupRow.isStock = sg.isStock
        groupRow.status = sg.status
        await sgRepo.save(groupRow)

        const srcOpts = await soRepo.find({ where: { specGroupId: sg.specGroupId } })
        const tgtOpts = await soRepo.find({ where: { specGroupId: groupRow.specGroupId } })
        const tgtOptByTpl = new Map<string, SpecOption>()
        for (const o of tgtOpts) tgtOptByTpl.set(o.templateId || o.optionId, o)
        const srcOptTplById = new Map<string, string>()
        for (const o of srcOpts) srcOptTplById.set(o.optionId, o.templateId || o.optionId)

        const nextTpl = new Set<string>()
        for (const o of srcOpts) {
          const otpl = o.templateId || o.optionId
          nextTpl.add(otpl)
          const tgtOpt = tgtOptByTpl.get(otpl)
          const optRow =
            tgtOpt ||
            soRepo.create({
              optionId: genId('op'),
              templateId: otpl,
              specGroupId: groupRow.specGroupId,
              name: o.name,
              priceCents: o.priceCents,
              sort: o.sort,
              status: o.status
            })
          optRow.templateId = otpl
          optRow.specGroupId = groupRow.specGroupId
          optRow.name = o.name
          optRow.priceCents = o.priceCents
          optRow.sort = o.sort
          optRow.status = o.status
          await soRepo.save(optRow)
        }
        const toInactive = tgtOpts.filter((x) => !nextTpl.has(x.templateId || x.optionId))
        if (toInactive.length) {
          for (const o of toInactive) o.status = 'INACTIVE'
          await soRepo.save(toInactive)
        }

        const defaultIds = parseJsonIds(sg.defaultOptionIds)
        const tgtOptsAfter = await soRepo.find({ where: { specGroupId: groupRow.specGroupId, status: 'ACTIVE' } })
        const tgtIdByTpl = new Map<string, string>()
        for (const o of tgtOptsAfter) tgtIdByTpl.set(o.templateId || o.optionId, o.optionId)
        const mappedDefault = defaultIds
          .map((id) => srcOptTplById.get(id) || null)
          .map((tpl) => (tpl ? tgtIdByTpl.get(tpl) || null : null))
          .filter((x): x is string => Boolean(x))
        groupRow.defaultOptionIds = mappedDefault.length
          ? JSON.stringify(mappedDefault.sort((a, b) => a.localeCompare(b)))
          : null
        await sgRepo.save(groupRow)
      }

      const stockGroups = await sgRepo.find({ where: { goodId: existing.goodId, status: 'ACTIVE', isStock: 1 } })
      const stockGroupIds = stockGroups.map((g) => g.specGroupId)
      const stockOptions = stockGroupIds.length
        ? await soRepo.find({ where: { specGroupId: In(stockGroupIds), status: 'ACTIVE' } })
        : []
      const optsByGroupId = new Map<string, SpecOption[]>()
      for (const o of stockOptions) {
        const arr = optsByGroupId.get(o.specGroupId) || []
        arr.push(o)
        optsByGroupId.set(o.specGroupId, arr)
      }

      const optionGroupsForSku = stockGroups
        .sort(
          (a, b) =>
            Number(b.sort || 0) - Number(a.sort || 0) || String(a.specGroupId).localeCompare(String(b.specGroupId))
        )
        .map((g) => {
          const options = (optsByGroupId.get(g.specGroupId) || [])
            .sort(
              (a, b) =>
                Number(b.sort || 0) - Number(a.sort || 0) || String(a.optionId).localeCompare(String(b.optionId))
            )
            .map((o) => ({ id: o.optionId, name: o.name, priceCents: BigInt(o.priceCents || '0') }))
          const min = g.isRequired ? Math.max(1, Number(g.minSelection || 0)) : 0
          const max = Math.min(Math.max(min, Number(g.maxSelection || 0)), options.length)
          return {
            id: g.specGroupId,
            name: g.name,
            isRequired: Boolean(g.isRequired),
            minSelection: Number.isInteger(g.minSelection) ? g.minSelection : min,
            maxSelection: Number.isInteger(g.maxSelection) ? g.maxSelection : max,
            options
          }
        })

      const vr = SkuGenerator.validateOptionGroups(
        optionGroupsForSku.map((g) => ({
          id: g.id,
          name: g.name,
          isRequired: g.isRequired,
          minSelection: g.minSelection,
          maxSelection: g.maxSelection,
          options: g.options,
          isStock: true
        }))
      )
      if (vr.ok) {
        const generated = optionGroupsForSku.length
          ? SkuGenerator.generate(BigInt(existing.basePrice || '0'), optionGroupsForSku)
          : SkuGenerator.generate(BigInt(existing.basePrice || '0'), [])
        const existingSkus = await skuRepo.find({ where: { goodId: existing.goodId } })
        const skuBySig = new Map<string, SKU>()
        for (const s of existingSkus) skuBySig.set(String((s as any).specSignature || s.specCombination), s)
        const nextSigs = new Set<string>()
        for (const gsku of generated) {
          const sig = gsku.specSignature
          nextSigs.add(sig)
          const es = skuBySig.get(sig)
          if (es) {
            ;(es as any).specCombination = gsku.specText
            ;(es as any).specKey = gsku.specKey
            ;(es as any).specSignature = gsku.specSignature
            ;(es as any).price = gsku.priceCents.toString()
            await skuRepo.save(es)
          } else {
            await skuRepo.save(
              skuRepo.create({
                skuId: genId('sku'),
                goodId: existing.goodId,
                specCombination: gsku.specText,
                specKey: gsku.specKey,
                specSignature: gsku.specSignature,
                price: gsku.priceCents.toString(),
                stock: 0,
                status: 'OFF_SHELF'
              })
            )
            skuCreated += 1
            updated = true
          }
        }
        const toOffShelf = existingSkus.filter(
          (s) => !nextSigs.has(String((s as any).specSignature || s.specCombination))
        )
        if (toOffShelf.length) {
          for (const s of toOffShelf) s.status = 'OFF_SHELF'
          await skuRepo.save(toOffShelf)
        }
        const allSkus = await skuRepo.find({ where: { goodId: existing.goodId }, order: { id: 'ASC' } })
        if (!existing.defaultSkuId) {
          existing.defaultSkuId = allSkus[0]?.skuId || null
          await goodRepo.save(existing)
        } else {
          const okDef = allSkus.some((s) => s.skuId === existing.defaultSkuId)
          if (!okDef) {
            existing.defaultSkuId = allSkus[0]?.skuId || null
            await goodRepo.save(existing)
          }
        }
      }

      if (updated) {
        goodUpdated += 1
        updatedGoods.push({ templateId: tpl, name: src.name })
      }
      continue
    }

    const srcCatLinks = (srcCatsByGoodId.get(src.goodId) || []).sort((a, b) => b.sort - a.sort)
    const mappedCatIds = Array.from(
      new Set(
        srcCatLinks
          .map((x) => {
            const ct = srcCatIdToTpl.get(x.categoryId) || x.categoryId
            return tgtCatIdByTpl.get(ct) || null
          })
          .filter((x): x is string => Boolean(x))
      )
    )
    const primaryCatId =
      mappedCatIds[0] || tgtCatIdByTpl.get(srcCatIdToTpl.get(src.categoryId) || src.categoryId) || src.categoryId

    const row = goodRepo.create({
      goodId: genId('good'),
      storeId: targetStoreId,
      templateId: tpl,
      categoryId: primaryCatId,
      defaultSkuId: null,
      name: src.name,
      description: src.description,
      detailMarkdown: src.detailMarkdown,
      imageUrls: src.imageUrls,
      sales: 0,
      basePrice: src.basePrice,
      status: 'OFF_SHELF'
    })
    await goodRepo.save(row)
    goodCreated += 1
    createdGoods.push({ templateId: tpl, name: src.name })

    const catRows = mappedCatIds.length ? mappedCatIds : [primaryCatId]
    if (catRows.length) {
      await goodCatRepo.insert(
        catRows.map((cid, idx) => ({
          storeId: targetStoreId,
          goodId: row.goodId,
          categoryId: cid,
          sort: (catRows.length - idx) * 10
        }))
      )
    }

    const links = srcLinksByGoodId.get(src.goodId) || []
    for (const l of links) {
      const tgtSharedGroupId = srcSharedGroupIdToTgtGroupId.get(l.sharedSpecGroupId)
      if (!tgtSharedGroupId) continue
      const disabled = mapSharedOptionIds({
        srcGroupId: l.sharedSpecGroupId,
        tgtGroupId: tgtSharedGroupId,
        ids: parseJsonIds((l as any).disabledOptionIds || null)
      })
      const defaults = mapSharedOptionIds({
        srcGroupId: l.sharedSpecGroupId,
        tgtGroupId: tgtSharedGroupId,
        ids: parseJsonIds((l as any).defaultOptionIds || null)
      })
      await gssgRepo
        .createQueryBuilder()
        .insert()
        .into(GoodSharedSpecGroup)
        .values({
          storeId: targetStoreId,
          goodId: row.goodId,
          sharedSpecGroupId: tgtSharedGroupId,
          disabledOptionIds: disabled.length ? JSON.stringify(disabled) : null,
          defaultOptionIds: defaults.length ? JSON.stringify(defaults) : null,
          sort: l.sort
        })
        .orIgnore()
        .execute()
    }

    const srcCustomGroups = await sgRepo.find({ where: { goodId: src.goodId } })
    const activeCustomGroups = srcCustomGroups.filter((g) => g.status === 'ACTIVE')
    const optionGroupsForSku: Array<{
      id: string
      name: string
      isRequired: boolean
      minSelection: number
      maxSelection: number
      options: Array<{ id: string; name: string; priceCents: bigint }>
    }> = []

    for (const sg of activeCustomGroups) {
      const gid = genId('og')
      const groupTpl = sg.templateId || sg.specGroupId
      const defaultTplIds = parseJsonIds(sg.defaultOptionIds)
      const srcOpts = await soRepo.find({ where: { specGroupId: sg.specGroupId, status: 'ACTIVE' } })
      const optionTplToNewId = new Map<string, string>()
      const newOptions: SpecOption[] = []
      const skuOptions: Array<{ id: string; name: string; priceCents: bigint }> = []
      for (const o of srcOpts) {
        const oid = genId('op')
        const otpl = o.templateId || o.optionId
        optionTplToNewId.set(otpl, oid)
        newOptions.push(
          soRepo.create({
            optionId: oid,
            templateId: otpl,
            specGroupId: gid,
            name: o.name,
            priceCents: o.priceCents,
            sort: o.sort,
            status: 'ACTIVE'
          })
        )
        skuOptions.push({ id: oid, name: o.name, priceCents: BigInt(o.priceCents || '0') })
      }

      const mappedDefault = defaultTplIds
        .map((t) => optionTplToNewId.get(t) || null)
        .filter((x): x is string => Boolean(x))
      const min = sg.isRequired ? Math.max(1, Number(sg.minSelection || 0)) : 0
      const max = Math.min(Math.max(min, Number(sg.maxSelection || 0)), skuOptions.length)

      const newGroup = sgRepo.create({
        specGroupId: gid,
        templateId: groupTpl,
        goodId: row.goodId,
        name: sg.name,
        sort: sg.sort,
        isStock: sg.isStock,
        status: 'ACTIVE',
        isRequired: sg.isRequired,
        minSelection: sg.minSelection,
        maxSelection: sg.maxSelection,
        defaultOptionIds: mappedDefault.length ? JSON.stringify(mappedDefault.sort((a, b) => a.localeCompare(b))) : null
      })
      await sgRepo.save(newGroup)
      if (newOptions.length) await soRepo.save(newOptions)

      if (sg.isStock) {
        optionGroupsForSku.push({
          id: gid,
          name: sg.name,
          isRequired: Boolean(sg.isRequired),
          minSelection: Number.isInteger(sg.minSelection) ? sg.minSelection : min,
          maxSelection: Number.isInteger(sg.maxSelection) ? sg.maxSelection : max,
          options: skuOptions
        })
      }
    }

    const vr = SkuGenerator.validateOptionGroups(
      optionGroupsForSku.map((g) => ({
        id: g.id,
        name: g.name,
        isRequired: g.isRequired,
        minSelection: g.minSelection,
        maxSelection: g.maxSelection,
        options: g.options,
        isStock: true
      }))
    )
    if (!vr.ok) continue

    const generated = optionGroupsForSku.length
      ? SkuGenerator.generate(BigInt(row.basePrice || '0'), optionGroupsForSku)
      : SkuGenerator.generate(BigInt(row.basePrice || '0'), [])

    const skuRows = generated.map((g) => ({
      skuId: genId('sku'),
      goodId: row.goodId,
      specCombination: g.specText,
      specKey: g.specKey,
      specSignature: g.specSignature,
      price: g.priceCents.toString(),
      stock: 0,
      status: 'OFF_SHELF' as const
    }))
    if (skuRows.length) {
      await skuRepo.createQueryBuilder().insert().into(SKU).values(skuRows).execute()
      skuCreated += skuRows.length
      const def = skuRows.find((x) => x.specSignature === 'default') || skuRows[0]
      row.defaultSkuId = def.skuId
      await goodRepo.save(row)
    }
  }

  return {
    categoryCreated,
    categoryUpdated,
    sharedSpecGroupCreated,
    sharedSpecGroupUpdated,
    sharedSpecOptionCreated,
    sharedSpecOptionUpdated,
    goodCreated,
    goodUpdated,
    skuCreated,
    created: { categories: createdCats, sharedSpecGroups: createdGroups, goods: createdGoods },
    updated: { categories: updatedCats, sharedSpecGroups: updatedGroups, goods: updatedGoods }
  }
}
