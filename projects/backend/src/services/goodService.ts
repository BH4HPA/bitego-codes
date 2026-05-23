import { AppDataSource } from '../db'
import { SpecGroup } from '../entities/SpecGroup'
import { SpecOption } from '../entities/SpecOption'
import { SKU } from '../entities/SKU'
import { GoodSpecChangeLog } from '../entities/GoodSpecChangeLog'
import { genId } from '../utils/id'
import { OptionGroupInput, SkuGenerator } from './skuGenerator'
import { PriceTransformer } from './priceTransformer'
import type { EntityManager } from 'typeorm'
import crypto from 'crypto'

export class GoodService {
  static stableHash(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)
  }

  static async repriceSkusFromOptionGroupsBySpecText(params: {
    manager: EntityManager
    goodId: string
    basePriceCents: bigint
    optionGroups: unknown
  }) {
    const { manager, goodId, basePriceCents, optionGroups } = params
    const skuRepo = manager.getRepository(SKU)

    const groups: OptionGroupInput[] = (Array.isArray(optionGroups) ? optionGroups : []).map((g) => {
      const gg = (g && typeof g === 'object' ? (g as Record<string, unknown>) : {}) as Record<string, unknown>
      const rawOptions = Array.isArray(gg.options) ? gg.options : []
      const isStock = gg.isStock === false ? false : true
      return {
        id: typeof gg.id === 'string' && gg.id ? gg.id : undefined,
        name: typeof gg.name === 'string' ? gg.name : '',
        isStock,
        options: rawOptions.map((o) => {
          const oo = (o && typeof o === 'object' ? (o as Record<string, unknown>) : {}) as Record<string, unknown>
          const priceInput = oo['priceCents']
          return {
            id: typeof oo.id === 'string' && oo.id ? oo.id : undefined,
            name: typeof oo.name === 'string' ? oo.name : '',
            priceCents: PriceTransformer.toCents(priceInput)
          }
        }),
        isRequired: Boolean(gg.isRequired),
        minSelection: Number.isInteger(gg.minSelection) ? (gg.minSelection as number) : 0,
        maxSelection: Number.isInteger(gg.maxSelection) ? (gg.maxSelection as number) : 0
      }
    })

    const stockGroups = groups.filter((g) => g.isStock !== false)
    const vr = SkuGenerator.validateOptionGroups(stockGroups)
    if (!vr.ok) return { ok: false as const, httpStatus: 400, code: 40000, message: vr.message }

    const groupsForGen = stockGroups.map((g) => ({
      id: String(g.id || ''),
      name: g.name,
      isRequired: g.isRequired,
      minSelection: g.minSelection,
      maxSelection: g.maxSelection,
      options: g.options.map((o) => ({ id: String(o.id || ''), name: o.name, priceCents: o.priceCents }))
    }))
    for (const g of groupsForGen) {
      if (!g.id) return { ok: false as const, httpStatus: 400, code: 40000, message: 'Invalid optionGroups.id' }
      for (const o of g.options) {
        if (!o.id)
          return { ok: false as const, httpStatus: 400, code: 40000, message: 'Invalid optionGroups.options.id' }
      }
    }

    const generated = SkuGenerator.generate(basePriceCents, groupsForGen)
    if (generated.length > 5000)
      return { ok: false as const, httpStatus: 400, code: 40000, message: 'Too many SKUs to generate' }

    const rows = await skuRepo.find({
      select: ['skuId', 'specCombination', 'price', 'specKey', 'specSignature'],
      where: { goodId }
    })
    const byText = new Map<string, SKU>()
    for (const r of rows) {
      const k = String(r.specCombination || '')
      if (byText.has(k))
        return {
          ok: false as const,
          httpStatus: 409,
          code: 40900,
          message: 'Duplicate SKU specCombination; cannot reprice deterministically'
        }
      byText.set(k, r)
    }

    const pending: Array<{
      skuId: string
      price: string
      specCombination: string
      specKey: string
      specSignature: string
    }> = []
    let skuPriceUpdatedCount = 0
    const chunkSize = 200

    const flush = async () => {
      if (!pending.length) return
      const ids = pending.map((p) => p.skuId)
      const params: Record<string, unknown> = { ids }
      const whenPrice = pending
        .map((p, i) => {
          params[`id${i}`] = p.skuId
          params[`p${i}`] = p.price
          return `WHEN :id${i} THEN :p${i}`
        })
        .join(' ')
      const whenText = pending
        .map((p, i) => {
          params[`t${i}`] = p.specCombination
          return `WHEN :id${i} THEN :t${i}`
        })
        .join(' ')
      const whenKey = pending
        .map((p, i) => {
          params[`k${i}`] = p.specKey
          return `WHEN :id${i} THEN :k${i}`
        })
        .join(' ')
      const whenSig = pending
        .map((p, i) => {
          params[`s${i}`] = p.specSignature
          return `WHEN :id${i} THEN :s${i}`
        })
        .join(' ')

      await skuRepo
        .createQueryBuilder()
        .update(SKU)
        .set({
          price: () => `CASE skuId ${whenPrice} ELSE price END`,
          specCombination: () => `CASE skuId ${whenText} ELSE specCombination END`,
          specKey: () => `CASE skuId ${whenKey} ELSE spec_key END`,
          specSignature: () => `CASE skuId ${whenSig} ELSE spec_signature END`
        })
        .where('skuId IN (:...ids)', { ids })
        .setParameters(params)
        .execute()

      skuPriceUpdatedCount += pending.length
      pending.length = 0
    }

    for (const g of generated) {
      const existing = byText.get(g.specText)
      if (!existing)
        return { ok: false as const, httpStatus: 409, code: 40900, message: 'SKU set mismatch; please rebuild SKUs' }
      const nextPrice = g.priceCents.toString()
      if (
        String(existing.price || '0') === nextPrice &&
        String(existing.specKey || '') === g.specKey &&
        String(existing.specSignature || '') === g.specSignature
      )
        continue
      pending.push({
        skuId: existing.skuId,
        price: nextPrice,
        specCombination: g.specText,
        specKey: g.specKey,
        specSignature: g.specSignature
      })
      if (pending.length >= chunkSize) await flush()
    }

    await flush()
    return { ok: true as const, skuPriceUpdatedCount }
  }

  static async syncSkusForGood(params: { manager: EntityManager; goodId: string; basePriceCents: bigint }) {
    const { manager, goodId, basePriceCents } = params
    const sgRepo = manager.getRepository(SpecGroup)
    const soRepo = manager.getRepository(SpecOption)
    const skuRepo = manager.getRepository(SKU)

    const activeGroups = (await sgRepo.find({ where: { goodId } })).filter(
      (g) => g.status === 'ACTIVE' && Boolean(g.isStock)
    )
    const groupNameById = new Map<string, string>()
    for (const g of activeGroups) groupNameById.set(g.specGroupId, g.name)
    const groupSortById = new Map<string, number>()
    for (const g of activeGroups) groupSortById.set(g.specGroupId, Number(g.sort || 0))
    const optionById = new Map<string, { name: string; priceCents: bigint; groupId: string }>()
    for (const g of activeGroups) {
      const opts = await soRepo.find({ where: { specGroupId: g.specGroupId, status: 'ACTIVE' } })
      for (const o of opts)
        optionById.set(o.optionId, { name: o.name, priceCents: BigInt(o.priceCents || '0'), groupId: g.specGroupId })
    }

    const parseSignature = (sig: string) => {
      const s = String(sig || '').trim()
      if (!s || s === 'default') return [] as Array<{ groupId: string; optionIds: string[] }>
      return s
        .split(';')
        .map((seg) => seg.trim())
        .filter(Boolean)
        .map((seg) => {
          const idx = seg.indexOf(':')
          if (idx === -1) return null
          const groupId = seg.slice(0, idx).trim()
          const optionIds = seg
            .slice(idx + 1)
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
          return groupId ? { groupId, optionIds } : null
        })
        .filter((x): x is { groupId: string; optionIds: string[] } => Boolean(x))
    }

    const renderSpecText = (parts: Array<{ groupId: string; optionIds: string[] }>) => {
      if (!parts.length) return '默认'
      const sorted = parts
        .slice()
        .sort(
          (a, b) =>
            (groupSortById.get(b.groupId) || 0) - (groupSortById.get(a.groupId) || 0) ||
            a.groupId.localeCompare(b.groupId)
        )
      return sorted
        .map((p) => {
          const groupName = groupNameById.get(p.groupId) || p.groupId
          const names = p.optionIds.map((id) => optionById.get(id)?.name).filter(Boolean) as string[]
          return `${groupName}:${names.join('、')}`
        })
        .join(' / ')
    }

    const calcAddPrice = (parts: Array<{ groupId: string; optionIds: string[] }>) => {
      let add = 0n
      for (const p of parts) {
        for (const oid of p.optionIds) {
          const o = optionById.get(oid)
          if (o) add += o.priceCents
        }
      }
      return add
    }

    const skus = await skuRepo.find({
      select: ['skuId', 'specSignature', 'specCombination', 'price', 'specKey'],
      where: { goodId }
    })
    let skuUpdatedCount = 0
    const chunkSize = 200
    const pending: Array<{
      skuId: string
      price: string
      specCombination: string
      specKey: string | null
      specSignature: string | null
    }> = []

    const flush = async () => {
      if (!pending.length) return
      const ids = pending.map((p) => p.skuId)
      const params: Record<string, unknown> = { ids }
      const whenPrice = pending
        .map((p, i) => {
          params[`id${i}`] = p.skuId
          params[`p${i}`] = p.price
          return `WHEN :id${i} THEN :p${i}`
        })
        .join(' ')
      const whenText = pending
        .map((p, i) => {
          params[`t${i}`] = p.specCombination
          return `WHEN :id${i} THEN :t${i}`
        })
        .join(' ')
      const whenKey = pending
        .map((p, i) => {
          params[`k${i}`] = p.specKey
          return `WHEN :id${i} THEN :k${i}`
        })
        .join(' ')
      const whenSig = pending
        .map((p, i) => {
          params[`s${i}`] = p.specSignature
          return `WHEN :id${i} THEN :s${i}`
        })
        .join(' ')

      await skuRepo
        .createQueryBuilder()
        .update(SKU)
        .set({
          price: () => `CASE skuId ${whenPrice} ELSE price END`,
          specCombination: () => `CASE skuId ${whenText} ELSE specCombination END`,
          specKey: () => `CASE skuId ${whenKey} ELSE spec_key END`,
          specSignature: () => `CASE skuId ${whenSig} ELSE spec_signature END`
        })
        .where('skuId IN (:...ids)', { ids })
        .setParameters(params)
        .execute()

      skuUpdatedCount += pending.length
      pending.length = 0
    }

    for (const s of skus) {
      const sig = String(s.specSignature || '').trim()
      if (!sig) {
        return {
          ok: false as const,
          httpStatus: 409,
          code: 40900,
          message: 'SKU missing specSignature; please rebuild SKUs'
        }
      }
      const parts = parseSignature(sig)
      const nextText = renderSpecText(parts)
      const nextPrice = (basePriceCents + calcAddPrice(parts)).toString()
      const nextKey = GoodService.stableHash(sig)
      const need =
        String(s.price || '0') !== nextPrice ||
        String(s.specCombination || '') !== nextText ||
        String(s.specKey || '') !== nextKey
      if (!need) continue
      pending.push({
        skuId: s.skuId,
        price: nextPrice,
        specCombination: nextText,
        specKey: nextKey,
        specSignature: sig
      })
      if (pending.length >= chunkSize) await flush()
    }

    await flush()
    return { ok: true as const, skuUpdatedCount }
  }

  static async upsertOptionGroupsAndGenerateSkus(params: {
    manager: EntityManager
    goodId: string
    basePriceCents: bigint
    optionGroups: unknown
    operator: { userId: string; role: string }
  }) {
    const { manager, goodId, basePriceCents, optionGroups, operator } = params
    const groups: OptionGroupInput[] = (Array.isArray(optionGroups) ? optionGroups : []).map((g) => {
      const gg = (g && typeof g === 'object' ? (g as Record<string, unknown>) : {}) as Record<string, unknown>
      const rawOptions = Array.isArray(gg.options) ? gg.options : []
      const rawDefault = Array.isArray(gg.defaultOptionIds) ? (gg.defaultOptionIds as unknown[]) : []
      return {
        id: typeof gg.id === 'string' && gg.id ? gg.id : undefined,
        name: typeof gg.name === 'string' ? gg.name : '',
        isStock: typeof gg.isStock === 'boolean' ? gg.isStock : true,
        sort: Number.isInteger(gg.sort) ? (gg.sort as number) : 0,
        defaultOptionIds: Array.from(new Set(rawDefault.map((x) => String(x || '')).filter((x) => x))),
        options: rawOptions.map((o) => {
          const oo = (o && typeof o === 'object' ? (o as Record<string, unknown>) : {}) as Record<string, unknown>
          const priceInput = oo['priceCents']
          return {
            id: typeof oo.id === 'string' && oo.id ? oo.id : undefined,
            name: typeof oo.name === 'string' ? oo.name : '',
            priceCents: PriceTransformer.toCents(priceInput)
          }
        }),
        isRequired: Boolean(gg.isRequired),
        minSelection: Number.isInteger(gg.minSelection) ? (gg.minSelection as number) : 0,
        maxSelection: Number.isInteger(gg.maxSelection) ? (gg.maxSelection as number) : 0
      }
    })

    const vr = SkuGenerator.validateOptionGroups(groups)
    if (!vr.ok) return { ok: false as const, httpStatus: 400, code: 40000, message: vr.message }

    const sgRepo = manager.getRepository(SpecGroup)
    const soRepo = manager.getRepository(SpecOption)
    const skuRepo = manager.getRepository(SKU)
    const logRepo = manager.getRepository(GoodSpecChangeLog)

    const readStructureSnapshot = async () => {
      const existingGroups = await sgRepo.find({ where: { goodId } })
      const activeGroups = existingGroups.filter((g) => g.status === 'ACTIVE' && Boolean(g.isStock))
      const out = []
      for (const g of activeGroups) {
        const opts = await soRepo.find({ where: { specGroupId: g.specGroupId, status: 'ACTIVE' } })
        out.push({
          id: g.specGroupId,
          isRequired: Boolean(g.isRequired),
          minSelection: g.minSelection,
          maxSelection: g.maxSelection,
          optionIds: opts.map((o) => o.optionId).sort((a, b) => a.localeCompare(b))
        })
      }
      out.sort((a, b) => a.id.localeCompare(b.id))
      return JSON.stringify(out)
    }

    const readFullSnapshot = async () => {
      const existingGroups = await sgRepo.find({ where: { goodId } })
      const activeGroups = existingGroups.filter((g) => g.status === 'ACTIVE')
      const out = []
      for (const g of activeGroups) {
        const opts = await soRepo.find({ where: { specGroupId: g.specGroupId, status: 'ACTIVE' } })
        let defaultOptionIds: string[] = []
        try {
          const parsed = g.defaultOptionIds ? JSON.parse(String(g.defaultOptionIds)) : []
          defaultOptionIds = Array.isArray(parsed) ? parsed.map((x) => String(x || '')).filter((x) => x) : []
        } catch {
          defaultOptionIds = []
        }
        out.push({
          id: g.specGroupId,
          name: g.name,
          sort: g.sort,
          isStock: Boolean(g.isStock),
          isRequired: Boolean(g.isRequired),
          minSelection: g.minSelection,
          maxSelection: g.maxSelection,
          defaultOptionIds: defaultOptionIds.sort((a, b) => a.localeCompare(b)),
          options: opts
            .map((o) => ({ id: o.optionId, name: o.name, priceCents: String(o.priceCents || '0') }))
            .sort((a, b) => a.id.localeCompare(b.id))
        })
      }
      out.sort((a, b) => a.id.localeCompare(b.id))
      return JSON.stringify(out)
    }

    const readStockSnapshot = async () => {
      const existingGroups = await sgRepo.find({ where: { goodId } })
      const activeGroups = existingGroups.filter((g) => g.status === 'ACTIVE' && Boolean(g.isStock))
      const out = []
      for (const g of activeGroups) {
        const opts = await soRepo.find({ where: { specGroupId: g.specGroupId, status: 'ACTIVE' } })
        out.push({
          id: g.specGroupId,
          name: g.name,
          sort: g.sort,
          isRequired: Boolean(g.isRequired),
          minSelection: g.minSelection,
          maxSelection: g.maxSelection,
          options: opts
            .map((o) => ({ id: o.optionId, name: o.name, priceCents: String(o.priceCents || '0') }))
            .sort((a, b) => a.id.localeCompare(b.id))
        })
      }
      out.sort((a, b) => a.id.localeCompare(b.id))
      return JSON.stringify(out)
    }

    const beforeStructureSnapshot = await readStructureSnapshot()
    const beforeFullSnapshot = await readFullSnapshot()
    const beforeStockSnapshot = await readStockSnapshot()
    const existingGroups = await sgRepo.find({ where: { goodId } })
    const keepGroupIds = new Set<string>()
    for (let idx = 0; idx < groups.length; idx++) {
      const g = groups[idx]
      const gid = g.id || genId('og')
      keepGroupIds.add(gid)
      let row: SpecGroup | null = existingGroups.find((x) => x.specGroupId === gid) || null
      const nextSort = Number.isInteger(g.sort) && g.sort ? g.sort : (groups.length - idx) * 10
      if (!row) {
        row = sgRepo.create({
          specGroupId: gid,
          goodId,
          name: g.name,
          sort: nextSort,
          isStock: g.isStock === false ? 0 : 1,
          status: 'ACTIVE',
          isRequired: g.isRequired ? 1 : 0,
          minSelection: g.minSelection,
          maxSelection: g.maxSelection,
          defaultOptionIds: null
        })
      } else {
        row.name = g.name
        row.sort = nextSort
        row.isStock = g.isStock === false ? 0 : 1
        row.isRequired = g.isRequired ? 1 : 0
        row.minSelection = g.minSelection
        row.maxSelection = g.maxSelection
        row.status = 'ACTIVE'
      }
      await sgRepo.save(row)

      const existingOptions = await soRepo.find({ where: { specGroupId: gid } })
      const keepOptionIds = new Set<string>()
      for (const o of g.options) {
        const oid = o.id || genId('op')
        o.id = oid
        keepOptionIds.add(oid)
        let orow: SpecOption | null = existingOptions.find((x) => x.optionId === oid) || null
        if (!orow) {
          orow = soRepo.create({
            optionId: oid,
            specGroupId: gid,
            name: o.name,
            sort: 0,
            status: 'ACTIVE',
            priceCents: o.priceCents.toString()
          })
        } else {
          orow.name = o.name
          orow.priceCents = o.priceCents.toString()
          orow.status = 'ACTIVE'
        }
        await soRepo.save(orow)
      }
      for (const old of existingOptions) {
        if (!keepOptionIds.has(old.optionId) && old.status !== 'INACTIVE') {
          old.status = 'INACTIVE'
          await soRepo.save(old)
        }
      }

      const defaultIds = Array.from(new Set((g.defaultOptionIds || []).map((x) => String(x || '')).filter((x) => x)))
      const validDefaultIds = defaultIds.filter((id) => keepOptionIds.has(id))
      if (defaultIds.length !== validDefaultIds.length)
        return { ok: false as const, httpStatus: 400, code: 40000, message: 'Invalid defaultOptionIds' }
      const min = g.isRequired ? Math.max(1, Number(g.minSelection || 0)) : 0
      const max = Math.min(Math.max(min, Number(g.maxSelection || 0)), keepOptionIds.size)
      if (validDefaultIds.length > 0 && (validDefaultIds.length < min || validDefaultIds.length > max))
        return { ok: false as const, httpStatus: 400, code: 40000, message: 'Invalid defaultOptionIds' }
      row.defaultOptionIds = validDefaultIds.length
        ? JSON.stringify(validDefaultIds.sort((a, b) => a.localeCompare(b)))
        : null
      await sgRepo.save(row)

      g.id = gid
    }

    for (const old of existingGroups) {
      if (!keepGroupIds.has(old.specGroupId) && old.status !== 'INACTIVE') {
        old.status = 'INACTIVE'
        await sgRepo.save(old)
      }
    }

    const afterStructureSnapshot = await readStructureSnapshot()
    const afterFullSnapshot = await readFullSnapshot()
    const afterStockSnapshot = await readStockSnapshot()
    const structureChanged = beforeStructureSnapshot !== afterStructureSnapshot
    const fullChanged = beforeFullSnapshot !== afterFullSnapshot
    const stockChanged = beforeStockSnapshot !== afterStockSnapshot
    const skuCount = await skuRepo.count({ where: { goodId } })
    const needRebuild = structureChanged || skuCount === 0

    let skuDeletedCount = 0
    let skuCreatedCount = 0
    let skuPriceUpdatedCount = 0

    if (fullChanged) {
      await logRepo.insert({
        goodId,
        operatorRole: operator.role,
        operatorUserId: operator.userId,
        beforeSnapshot: beforeFullSnapshot,
        afterSnapshot: afterFullSnapshot
      })
    }

    if (needRebuild) {
      const groupsForGen: Array<{
        id: string
        name: string
        isRequired: boolean
        minSelection: number
        maxSelection: number
        options: Array<{ id: string; name: string; priceCents: bigint }>
      }> = []
      for (const g of groups.filter((x) => x.isStock !== false)) {
        const options = await soRepo.find({ where: { specGroupId: g.id!, status: 'ACTIVE' } })
        groupsForGen.push({
          id: g.id!,
          name: g.name,
          isRequired: g.isRequired,
          minSelection: g.minSelection,
          maxSelection: g.maxSelection,
          options: options.map((o) => ({ id: o.optionId, name: o.name, priceCents: BigInt(o.priceCents || '0') }))
        })
      }

      const generated = SkuGenerator.generate(basePriceCents, groupsForGen)
      if (generated.length > 5000)
        return { ok: false as const, httpStatus: 400, code: 40000, message: 'Too many SKUs to generate' }

      const existingSkuIds = await skuRepo.find({ select: ['skuId'], where: { goodId } })
      const ids = existingSkuIds.map((s) => s.skuId)
      const chunkSize = 500
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        if (!chunk.length) continue
        const r = await skuRepo
          .createQueryBuilder()
          .delete()
          .from(SKU)
          .where('skuId IN (:...ids)', { ids: chunk })
          .execute()
        skuDeletedCount += r.affected || 0
      }

      const rows = generated.map((g) => ({
        skuId: genId('sku'),
        goodId,
        specCombination: g.specText,
        specKey: g.specKey,
        specSignature: g.specSignature,
        price: g.priceCents.toString(),
        stock: 0,
        status: 'OFF_SHELF' as const
      }))
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)
        if (!chunk.length) continue
        await skuRepo.createQueryBuilder().insert().into(SKU).values(chunk).execute()
        skuCreatedCount += chunk.length
      }
    } else if (stockChanged) {
      const rr = await GoodService.syncSkusForGood({ manager, goodId, basePriceCents })
      if (!rr.ok) return rr
      skuPriceUpdatedCount = rr.skuUpdatedCount
    }

    return { ok: true as const, skuRebuilt: needRebuild, skuDeletedCount, skuCreatedCount, skuPriceUpdatedCount }
  }
}
