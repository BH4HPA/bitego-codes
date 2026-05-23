import { Router } from 'express'
import { AppDataSource } from '../db'
import { Good } from '../entities/Good'
import { GoodCategory } from '../entities/GoodCategory'
import { SKU } from '../entities/SKU'
import { SpecGroup } from '../entities/SpecGroup'
import { SpecOption } from '../entities/SpecOption'
import { SharedSpecGroup } from '../entities/SharedSpecGroup'
import { SharedSpecOption } from '../entities/SharedSpecOption'
import { GoodSharedSpecGroup } from '../entities/GoodSharedSpecGroup'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { asyncHandler } from '../http/asyncHandler'
import { created, ok } from '../http/responses'
import { In, Like } from 'typeorm'
import type { FindOptionsOrder, FindOptionsWhere, Repository } from 'typeorm'
import { requireAuth, requireAdmin, getAuthUser, optionalAuth } from '../middlewares/auth'
import { getActiveStoreId, getAdminContext, requireAdminContext } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'
import { GoodService } from '../services/goodService'
import { isPrimaryStore, recordStoreSyncChange } from '../services/storeSyncChangeService'

const router = Router()

async function resolveTenantAndStore(params: { tenantId: string; storeId: string | null }) {
  const tenantRepo = AppDataSource.getRepository(Tenant)
  const tenant = await tenantRepo.findOne({ where: { tenantId: params.tenantId } })
  if (!tenant || tenant.deletedAt) {
    return { tenant: null, storeId: null }
  }
  const storeId = params.storeId || tenant.primaryStoreId || null
  return { tenant, storeId }
}

function parseImageUrls(row: { imageUrls?: string | null }) {
  const raw = row.imageUrls
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x))
  } catch {
    return []
  }
}

function parseImageUrlsFromBody(body: any) {
  if (!Array.isArray(body?.imageUrls)) return []
  const urls: string[] = []
  for (const u of body.imageUrls) {
    if (typeof u === 'string' && u.trim()) urls.push(u.trim())
  }
  return urls
}

function parseBasePriceCentsInput(value: unknown): bigint {
  if (value === undefined) return 0n
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new Error('Invalid basePrice')
  }
  return BigInt(n)
}

function parsePriceCentsInput(value: unknown): bigint {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new Error('Invalid price')
  }
  return BigInt(n)
}

function parseDefaultOptionIds(raw: unknown) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed.map((x) => String(x || '')).filter((x) => x) : []
  } catch {
    return []
  }
}

function parseIdList(raw: unknown) {
  if (!raw) return []
  if (Array.isArray(raw)) return Array.from(new Set(raw.map((x) => String(x || '')).filter((x) => x)))
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? Array.from(new Set(parsed.map((x) => String(x || '')).filter((x) => x))) : []
  } catch {
    return []
  }
}

function minSelectionForGroup(group: { isRequired?: number; minSelection?: number }) {
  const min = Number(group.minSelection || 0) || 0
  const requiredMin = group.isRequired ? Math.max(1, min) : min
  return Math.max(0, requiredMin)
}

function computeRequiredNonStockMinFromGroups(params: {
  groups: Array<{ specGroupId: string; isStock?: number; isRequired?: number; minSelection?: number }>
  optionsByGroupId: Map<string, Array<{ priceCents?: string | number | bigint }>>
}) {
  const { groups, optionsByGroupId } = params
  let sum = 0n
  for (const g of groups) {
    if (g.isStock) continue
    const min = minSelectionForGroup(g)
    if (min <= 0) continue
    const opts = (optionsByGroupId.get(g.specGroupId) || [])
      .map((o) => BigInt(o.priceCents || '0'))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    if (!opts.length) continue
    const count = Math.min(min, opts.length)
    let groupSum = 0n
    for (let i = 0; i < count; i += 1) groupSum += opts[i]
    sum += groupSum
  }
  return sum
}

function splitSharedOptionGroups(input: any) {
  const raw = Array.isArray(input) ? input : []
  const shared: Array<{
    sharedSpecGroupId: string
    sort: number
    disabledOptionIds: string[]
    defaultOptionIds: string[]
  }> = []
  const custom: any[] = []
  for (const g of raw) {
    const sharedSpecGroupId =
      typeof g?.sharedSpecGroupId === 'string' && g.sharedSpecGroupId.trim()
        ? g.sharedSpecGroupId.trim()
        : typeof g?.groupType === 'string' && g.groupType === 'shared' && typeof g?.id === 'string' && g.id.trim()
          ? g.id.trim()
          : null
    if (sharedSpecGroupId) {
      shared.push({
        sharedSpecGroupId,
        sort: Number(g?.sort || 0) || 0,
        disabledOptionIds: parseIdList(g?.disabledOptionIds),
        defaultOptionIds: parseIdList(g?.defaultOptionIds)
      })
    } else {
      custom.push(g)
    }
  }
  return { shared, custom }
}

async function loadRequiredNonStockMinByGoodId(params: {
  goodIds: string[]
  sgRepo: Repository<SpecGroup>
  soRepo: Repository<SpecOption>
  ssgRepo: Repository<SharedSpecGroup>
  ssoRepo: Repository<SharedSpecOption>
  linkRepo: Repository<GoodSharedSpecGroup>
}) {
  const { goodIds, sgRepo, soRepo, ssgRepo, ssoRepo, linkRepo } = params
  const result = new Map<string, bigint>()
  if (!goodIds.length) return result
  const groups = await sgRepo.find({ where: { goodId: In(goodIds), status: 'ACTIVE', isStock: 0 } })
  const groupIds = groups.map((g) => g.specGroupId)
  const opts = groupIds.length ? await soRepo.find({ where: { specGroupId: In(groupIds), status: 'ACTIVE' } }) : []
  const optionsByGroupId = new Map<string, Array<{ priceCents?: string | number | bigint }>>()
  for (const o of opts) {
    const arr = optionsByGroupId.get(o.specGroupId) || []
    arr.push(o)
    optionsByGroupId.set(o.specGroupId, arr)
  }
  const groupsByGoodId = new Map<string, SpecGroup[]>()
  for (const g of groups) {
    const arr = groupsByGoodId.get(g.goodId) || []
    arr.push(g)
    groupsByGoodId.set(g.goodId, arr)
  }

  const links = await linkRepo.find({ where: { goodId: In(goodIds) } })
  const sharedIds = Array.from(new Set(links.map((l) => l.sharedSpecGroupId)))
  const sharedGroups = sharedIds.length
    ? await ssgRepo.find({ where: { sharedSpecGroupId: In(sharedIds), status: 'ACTIVE' } })
    : []
  const sharedById = new Map(sharedGroups.map((g) => [g.sharedSpecGroupId, g]))
  const sharedOptions = sharedIds.length
    ? await ssoRepo.find({ where: { sharedSpecGroupId: In(sharedIds), status: 'ACTIVE' } })
    : []
  const sharedOptionsByGroupId = new Map<string, Array<{ priceCents?: string | number | bigint }>>()
  for (const o of sharedOptions) {
    const arr = sharedOptionsByGroupId.get(o.sharedSpecGroupId) || []
    arr.push(o)
    sharedOptionsByGroupId.set(o.sharedSpecGroupId, arr)
  }
  const sharedGroupsByGoodId = new Map<
    string,
    Array<{ specGroupId: string; isRequired?: number; minSelection?: number; disabledOptionIds: string[] }>
  >()
  for (const link of links) {
    const g = sharedById.get(link.sharedSpecGroupId)
    if (!g) continue
    const arr = sharedGroupsByGoodId.get(link.goodId) || []
    arr.push({
      specGroupId: g.sharedSpecGroupId,
      isRequired: g.isRequired,
      minSelection: g.minSelection,
      disabledOptionIds: parseDefaultOptionIds((link as any).disabledOptionIds)
    })
    sharedGroupsByGoodId.set(link.goodId, arr)
  }

  for (const goodId of goodIds) {
    const gs = groupsByGoodId.get(goodId) || []
    const sharedGs = sharedGroupsByGoodId.get(goodId) || []
    let sum = computeRequiredNonStockMinFromGroups({ groups: gs, optionsByGroupId })
    for (const sg of sharedGs) {
      const opts = sharedOptionsByGroupId.get(sg.specGroupId) || []
      const disabled = new Set(sg.disabledOptionIds || [])
      const filtered = opts.filter((o: any) => !disabled.has(String((o as any).optionId || (o as any).id || '')))
      sum += computeRequiredNonStockMinFromGroups({
        groups: [sg],
        optionsByGroupId: new Map([[sg.specGroupId, filtered]])
      })
    }
    if (sum > 0n) result.set(goodId, sum)
  }
  return result
}

router.get(
  '/api/v1/goods',
  asyncHandler(async (req, res) => {
    const repo = AppDataSource.getRepository(Good)
    const mapRepo = AppDataSource.getRepository(GoodCategory)
    const status = typeof req.query.status === 'string' ? req.query.status : 'ON_SHELF'
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined
    const name = typeof req.query.name === 'string' ? req.query.name : undefined
    const storeIdHeader =
      typeof req.headers['x-store-id'] === 'string' && req.headers['x-store-id']
        ? String(req.headers['x-store-id'])
        : ''
    const tenantIdHeader =
      typeof req.headers['x-tenant-id'] === 'string' && req.headers['x-tenant-id']
        ? String(req.headers['x-tenant-id'])
        : ''
    let storeId =
      (typeof req.query.storeId === 'string' && req.query.storeId ? String(req.query.storeId) : '') ||
      storeIdHeader ||
      ''
    if (!storeId && tenantIdHeader) {
      const tenantRepo = AppDataSource.getRepository(Tenant)
      const tenant = await tenantRepo.findOne({ where: { tenantId: tenantIdHeader } })
      if (tenant && !tenant.deletedAt && tenant.primaryStoreId) storeId = tenant.primaryStoreId
    }
    if (!storeId) storeId = 'store_default'
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const pageSize = Math.min(500, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20))
    const where: FindOptionsWhere<Good> = {}
    where.storeId = storeId
    if (status) where.status = status
    if (name) where.name = Like(`%${name}%`)
    const order: FindOptionsOrder<Good> = { id: 'DESC' }
    let rows: Good[] = []
    let total = 0
    if (categoryId) {
      rows = await repo
        .createQueryBuilder('g')
        .leftJoin(
          GoodCategory,
          'gc',
          'gc.goodId = g.goodId AND gc.categoryId = :categoryId AND gc.storeId = :storeId',
          { categoryId, storeId }
        )
        .addSelect('gc.sort', 'gc_sort')
        .where(where)
        .andWhere('(gc.categoryId IS NOT NULL OR g.categoryId = :categoryId)', { categoryId })
        .orderBy('gc_sort', 'DESC')
        .addOrderBy('g.createdAt', 'ASC')
        .addOrderBy('g.id', 'ASC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getMany()
      total = await repo
        .createQueryBuilder('g')
        .leftJoin(
          GoodCategory,
          'gc',
          'gc.goodId = g.goodId AND gc.categoryId = :categoryId AND gc.storeId = :storeId',
          { categoryId, storeId }
        )
        .where(where)
        .andWhere('(gc.categoryId IS NOT NULL OR g.categoryId = :categoryId)', { categoryId })
        .getCount()
    } else {
      const r = await repo.findAndCount({ where, skip: (page - 1) * pageSize, take: pageSize, order })
      rows = r[0]
      total = r[1]
    }
    const skuRepo = AppDataSource.getRepository(SKU)
    const sgRepo = AppDataSource.getRepository(SpecGroup)
    const soRepo = AppDataSource.getRepository(SpecOption)
    const ssgRepo = AppDataSource.getRepository(SharedSpecGroup)
    const ssoRepo = AppDataSource.getRepository(SharedSpecOption)
    const linkRepo = AppDataSource.getRepository(GoodSharedSpecGroup)
    const goodIds = rows.map((g) => g.goodId)
    const categoryIdsByGoodId = new Map<string, string[]>()
    const categorySortByIdByGoodId = new Map<string, Record<string, number>>()
    if (goodIds.length) {
      const maps = await mapRepo.find({ where: { storeId, goodId: In(goodIds) } })
      for (const m of maps) {
        const arr = categoryIdsByGoodId.get(m.goodId) || []
        arr.push(m.categoryId)
        categoryIdsByGoodId.set(m.goodId, arr)
        const cur = categorySortByIdByGoodId.get(m.goodId) || {}
        cur[m.categoryId] = Number(m.sort || 0) || 0
        categorySortByIdByGoodId.set(m.goodId, cur)
      }
    }
    const minPriceByGoodId = new Map<string, bigint>()
    const availableGoodIdSet = new Set<string>()
    if (goodIds.length) {
      type MinRow = { goodId: string; minPrice: string | null }
      const mins = await skuRepo
        .createQueryBuilder('sku')
        .select('sku.goodId', 'goodId')
        .addSelect('MIN(sku.price)', 'minPrice')
        .where('sku.goodId IN (:...goodIds)', { goodIds })
        .groupBy('sku.goodId')
        .getRawMany<MinRow>()
      for (const r of mins) {
        minPriceByGoodId.set(r.goodId, BigInt(r.minPrice || '0'))
      }
      const availRows = await skuRepo
        .createQueryBuilder('sku')
        .select('sku.goodId', 'goodId')
        .where('sku.goodId IN (:...goodIds)', { goodIds })
        .andWhere("sku.status = 'ON_SHELF'")
        .andWhere('sku.stock > 0')
        .groupBy('sku.goodId')
        .getRawMany<{ goodId: string }>()
      for (const r of availRows) availableGoodIdSet.add(r.goodId)
    }
    const nonStockMinByGoodId = await loadRequiredNonStockMinByGoodId({
      goodIds,
      sgRepo,
      soRepo,
      ssgRepo,
      ssoRepo,
      linkRepo
    })
    ok(res, {
      list: rows.map((g) => ({
        goodId: g.goodId,
        name: g.name,
        description: g.description,
        imageUrls: parseImageUrls(g),
        categoryId: g.categoryId,
        categoryIds: categoryIdsByGoodId.get(g.goodId) || [g.categoryId],
        categorySortById: categorySortByIdByGoodId.get(g.goodId) || {},
        defaultSkuId: g.defaultSkuId || null,
        createdAt: g.createdAt,
        sales: g.sales,
        status: g.status,
        basePriceCents: Number(String(g.basePrice || '0')),
        minPriceCents: Number(
          ((minPriceByGoodId.get(g.goodId) || 0n) + (nonStockMinByGoodId.get(g.goodId) || 0n)).toString()
        ),
        soldOut: !availableGoodIdSet.has(g.goodId)
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.get(
  '/api/v1/goods/:goodId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { goodId } = req.params
    const user = getAuthUser(req)
    const isAdmin = user?.role === 'ADMIN'
    const storeIdHeader =
      typeof req.headers['x-store-id'] === 'string' && req.headers['x-store-id']
        ? String(req.headers['x-store-id'])
        : ''
    const storeId =
      (typeof req.query.storeId === 'string' && req.query.storeId ? String(req.query.storeId) : '') ||
      storeIdHeader ||
      'store_default'
    const goodRepo = AppDataSource.getRepository(Good)
    const mapRepo = AppDataSource.getRepository(GoodCategory)
    const skuRepo = AppDataSource.getRepository(SKU)
    const sgRepo = AppDataSource.getRepository(SpecGroup)
    const soRepo = AppDataSource.getRepository(SpecOption)
    const ssgRepo = AppDataSource.getRepository(SharedSpecGroup)
    const ssoRepo = AppDataSource.getRepository(SharedSpecOption)
    const linkRepo = AppDataSource.getRepository(GoodSharedSpecGroup)
    const g = await goodRepo.findOne({ where: { goodId, storeId } })
    if (!g) {
      res.status(404).json({ success: false, code: 40400, message: 'Good not found', data: null })
      return
    }
    const groups = await sgRepo.find({ where: { goodId } })
    const groupIds = groups.map((x) => x.specGroupId)
    const opts = groupIds.length ? await soRepo.find({ where: { specGroupId: In(groupIds), status: 'ACTIVE' } }) : []
    const optionsByGroup = new Map<string, SpecOption[]>()
    for (const o of opts) {
      const arr = optionsByGroup.get(o.specGroupId) || []
      arr.push(o)
      optionsByGroup.set(o.specGroupId, arr)
    }
    const skus = await skuRepo.find({ where: { goodId } })
    const minPriceRow = await skuRepo
      .createQueryBuilder('sku')
      .select('MIN(sku.price)', 'minPrice')
      .where('sku.goodId = :goodId', { goodId })
      .getRawOne<{ minPrice: string | null }>()
    const minPrice = BigInt(minPriceRow?.minPrice || '0')
    const nonStockMin = computeRequiredNonStockMinFromGroups({
      groups,
      optionsByGroupId: new Map(
        Array.from(optionsByGroup.entries()).map(([k, v]) => [k, v.map((o) => ({ priceCents: o.priceCents }))])
      )
    })
    const sharedLinks = await linkRepo.find({ where: { goodId } })
    const sharedIds = Array.from(new Set(sharedLinks.map((x) => x.sharedSpecGroupId)))
    const sharedGroups = sharedIds.length
      ? await ssgRepo.find({ where: { sharedSpecGroupId: In(sharedIds), status: 'ACTIVE' } })
      : []
    const sharedById = new Map(sharedGroups.map((x) => [x.sharedSpecGroupId, x]))
    const sharedOptions = sharedIds.length
      ? await ssoRepo.find({ where: { sharedSpecGroupId: In(sharedIds), status: 'ACTIVE' } })
      : []
    const sharedOptionsByGroupId = new Map<string, SharedSpecOption[]>()
    for (const o of sharedOptions) {
      const arr = sharedOptionsByGroupId.get(o.sharedSpecGroupId) || []
      arr.push(o)
      sharedOptionsByGroupId.set(o.sharedSpecGroupId, arr)
    }
    let sharedNonStockMin = 0n
    for (const link of sharedLinks) {
      const sg = sharedById.get(link.sharedSpecGroupId)
      if (!sg) continue
      const disabled = new Set(parseDefaultOptionIds((link as any).disabledOptionIds))
      const opts = (sharedOptionsByGroupId.get(sg.sharedSpecGroupId) || []).filter((o) => !disabled.has(o.optionId))
      sharedNonStockMin += computeRequiredNonStockMinFromGroups({
        groups: [{ specGroupId: sg.sharedSpecGroupId, isRequired: sg.isRequired, minSelection: sg.minSelection }],
        optionsByGroupId: new Map([[sg.sharedSpecGroupId, opts.map((o) => ({ priceCents: o.priceCents }))]])
      })
    }
    const maps = await mapRepo.find({ where: { goodId } })
    const categoryIds = maps.map((m) => m.categoryId)
    const sharedGroupDtos = sharedLinks
      .map((link) => {
        const sg = sharedById.get(link.sharedSpecGroupId)
        if (!sg) return null
        const disabledOptionIdSet = new Set(parseDefaultOptionIds((link as any).disabledOptionIds))
        const optionIds = new Set((sharedOptionsByGroupId.get(sg.sharedSpecGroupId) || []).map((o) => o.optionId))
        const allOptions = sharedOptionsByGroupId.get(sg.sharedSpecGroupId) || []
        const enabledOptions = allOptions.filter((o) => !disabledOptionIdSet.has(o.optionId))
        const linkDefault = parseDefaultOptionIds((link as any).defaultOptionIds).filter(
          (id) => optionIds.has(id) && !disabledOptionIdSet.has(id)
        )
        const groupDefault = parseDefaultOptionIds(sg.defaultOptionIds).filter(
          (id) => optionIds.has(id) && !disabledOptionIdSet.has(id)
        )
        const effectiveDefaultOptionIds = (linkDefault.length ? linkDefault : groupDefault).sort((a, b) =>
          a.localeCompare(b)
        )
        return {
          id: sg.sharedSpecGroupId,
          sharedSpecGroupId: sg.sharedSpecGroupId,
          groupType: 'shared',
          name: sg.name,
          sort: link.sort,
          isStock: false,
          isRequired: Boolean(sg.isRequired),
          minSelection: sg.minSelection,
          maxSelection: sg.maxSelection,
          ...(isAdmin
            ? {
                linkDefaultOptionIds: linkDefault.sort((a, b) => a.localeCompare(b)),
                disabledOptionIds: Array.from(disabledOptionIdSet)
                  .filter((id) => optionIds.has(id))
                  .sort((a, b) => a.localeCompare(b))
              }
            : {}),
          defaultOptionIds: effectiveDefaultOptionIds,
          options: (isAdmin ? allOptions : enabledOptions)
            .slice()
            .sort(
              (a, b) =>
                Number(b.sort || 0) - Number(a.sort || 0) || String(a.optionId).localeCompare(String(b.optionId))
            )
            .map((o) => ({
              id: o.optionId,
              name: o.name,
              price: String(o.priceCents || '0'),
              priceCents: Number(String(o.priceCents || '0'))
            }))
        }
      })
      .filter(Boolean) as Array<{
      id: string
      sharedSpecGroupId: string
      groupType: string
      name: string
      sort: number
      isStock: boolean
      isRequired: boolean
      minSelection: number
      maxSelection: number
      defaultOptionIds: string[]
      options: Array<{ id: string; name: string; price: string; priceCents: number }>
    }>
    ok(res, {
      goodId: g.goodId,
      name: g.name,
      description: g.description,
      detailMarkdown: g.detailMarkdown || '',
      imageUrls: parseImageUrls(g),
      categoryId: g.categoryId,
      categoryIds: categoryIds.length ? categoryIds : [g.categoryId],
      defaultSkuId: g.defaultSkuId || null,
      sales: g.sales,
      basePriceCents: Number(String(g.basePrice || '0')),
      status: g.status,
      minPriceCents: Number((minPrice + nonStockMin + sharedNonStockMin).toString()),
      optionGroups: [
        ...groups
          .filter((sg) => sg.status === 'ACTIVE')
          .sort(
            (a, b) =>
              Number(b.sort || 0) - Number(a.sort || 0) || String(a.specGroupId).localeCompare(String(b.specGroupId))
          )
          .map((sg) => ({
            id: sg.specGroupId,
            groupType: 'custom',
            name: sg.name,
            sort: sg.sort,
            isStock: Boolean(sg.isStock),
            isRequired: Boolean(sg.isRequired),
            minSelection: sg.minSelection,
            maxSelection: sg.maxSelection,
            defaultOptionIds: parseDefaultOptionIds((sg as any).defaultOptionIds).sort((a, b) => a.localeCompare(b)),
            options: (optionsByGroup.get(sg.specGroupId) || [])
              .slice()
              .sort(
                (a, b) =>
                  Number(b.sort || 0) - Number(a.sort || 0) || String(a.optionId).localeCompare(String(b.optionId))
              )
              .map((o) => ({
                id: o.optionId,
                name: o.name,
                priceCents: Number(String(o.priceCents || '0'))
              }))
          })),
        ...sharedGroupDtos
      ].sort((a, b) => Number(b.sort || 0) - Number(a.sort || 0) || String(a.id).localeCompare(String(b.id))),
      skus: skus.map((s) => ({
        skuId: s.skuId,
        specCombination: s.specCombination,
        priceCents: Number(String(s.price || '0')),
        stock: s.stock,
        status: s.status
      }))
    })
  })
)

router.post(
  '/api/v1/goods',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const {
      categoryId,
      categoryIds,
      name,
      description = '',
      detailMarkdown = '',
      status = 'OFF_SHELF',
      optionGroups,
      basePriceCents
    } = req.body || {}
    const catIdsRaw = Array.isArray(categoryIds) ? categoryIds : categoryId ? [categoryId] : []
    const catIds = Array.from(
      new Set(catIdsRaw.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()))
    )
    if (!catIds.length || !name || typeof name !== 'string') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    if (typeof detailMarkdown !== 'string') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid detailMarkdown', data: null })
      return
    }
    let basePriceCentsBI = 0n
    try {
      basePriceCentsBI = parseBasePriceCentsInput(basePriceCents)
    } catch {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid basePrice', data: null })
      return
    }
    const user = getAuthUser(req)
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    if (!ctx.canManageSharedCatalog) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const storeId = resolved.storeId
    const okPrimary = await isPrimaryStore({ manager: AppDataSource.manager, tenantId: ctx.tenantId, storeId })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    try {
      const imageUrls = parseImageUrlsFromBody(req.body)
      const result = await AppDataSource.transaction(async (manager) => {
        const fail = (httpStatus: number, code: number, message: string): never => {
          const err: any = new Error(message)
          err.httpStatus = httpStatus
          err.code = code
          throw err
        }
        const repo = manager.getRepository(Good)
        const mapRepo = manager.getRepository(GoodCategory)
        const goodId = genId('good')
        const row = repo.create({
          goodId,
          storeId,
          categoryId: catIds[0],
          defaultSkuId: null,
          name,
          description,
          detailMarkdown: detailMarkdown || null,
          imageUrls: imageUrls.length ? JSON.stringify(imageUrls) : null,
          sales: 0,
          status,
          basePrice: basePriceCentsBI.toString()
        })
        await repo.save(row)
        await mapRepo.insert(catIds.map((c: string) => ({ storeId, goodId, categoryId: c, sort: 0 })))
        const { shared, custom } = splitSharedOptionGroups(optionGroups)
        const sharedRepo = manager.getRepository(SharedSpecGroup)
        const sharedOptRepo = manager.getRepository(SharedSpecOption)
        const linkRepo = manager.getRepository(GoodSharedSpecGroup)
        if (shared.length) {
          const ids = Array.from(new Set(shared.map((x) => x.sharedSpecGroupId)))
          const sharedRows = await sharedRepo.find({ where: { storeId, sharedSpecGroupId: In(ids), status: 'ACTIVE' } })
          if (sharedRows.length !== ids.length) fail(400, 40000, 'Invalid sharedSpecGroupId')
          const sharedById = new Map(sharedRows.map((x) => [x.sharedSpecGroupId, x]))
          const opts = await sharedOptRepo.find({ where: { sharedSpecGroupId: In(ids), status: 'ACTIVE' } })
          const optionIdsByGroupId = new Map<string, Set<string>>()
          for (const o of opts) {
            const set = optionIdsByGroupId.get(o.sharedSpecGroupId) || new Set()
            set.add(o.optionId)
            optionIdsByGroupId.set(o.sharedSpecGroupId, set)
          }
          for (const s of shared) {
            const g2 = sharedById.get(s.sharedSpecGroupId)
            if (!g2) fail(400, 40000, 'Invalid sharedSpecGroupId')
            const allowed = optionIdsByGroupId.get(s.sharedSpecGroupId) || new Set()
            const disabled = Array.from(new Set((s.disabledOptionIds || []).filter((id) => allowed.has(id))))
            if (disabled.length !== (s.disabledOptionIds || []).length) fail(400, 40000, 'Invalid disabledOptionIds')
            const enabledCount = Math.max(0, allowed.size - disabled.length)
            const min = minSelectionForGroup({ isRequired: g2!.isRequired, minSelection: g2!.minSelection })
            if (min > 0 && enabledCount < min) fail(400, 40000, 'Invalid disabledOptionIds')
            const linkDefault = Array.from(
              new Set((s.defaultOptionIds || []).filter((id) => allowed.has(id) && !disabled.includes(id)))
            )
            if (linkDefault.length !== (s.defaultOptionIds || []).length) fail(400, 40000, 'Invalid defaultOptionIds')
            if (linkDefault.length) {
              if (linkDefault.length > g2!.maxSelection) fail(400, 40000, 'Invalid defaultOptionIds')
              if (linkDefault.length < min) fail(400, 40000, 'Invalid defaultOptionIds')
            }
          }
          await linkRepo.insert(
            shared.map((s) => ({
              storeId,
              goodId,
              sharedSpecGroupId: s.sharedSpecGroupId,
              disabledOptionIds: s.disabledOptionIds?.length ? JSON.stringify(s.disabledOptionIds) : null,
              defaultOptionIds: s.defaultOptionIds?.length ? JSON.stringify(s.defaultOptionIds) : null,
              sort: s.sort
            }))
          )
        }
        const r = await GoodService.upsertOptionGroupsAndGenerateSkus({
          manager,
          goodId,
          basePriceCents: basePriceCentsBI,
          optionGroups: custom ?? [],
          operator: { userId: user?.userId || 'unknown', role: user?.role || 'UNKNOWN' }
        })
        if (!r.ok) fail(r.httpStatus, r.code, r.message)
        const skuRepo = manager.getRepository(SKU)
        const firstSku = await skuRepo.findOne({ where: { goodId }, order: { id: 'ASC' } })
        if (firstSku?.skuId) {
          row.defaultSkuId = firstSku.skuId
          await repo.save(row)
        }
        const rr = r as Extract<typeof r, { ok: true }>
        const skuRebuild = {
          skuRebuilt: rr.skuRebuilt,
          skuDeletedCount: rr.skuDeletedCount,
          skuCreatedCount: rr.skuCreatedCount,
          skuPriceUpdatedCount: rr.skuPriceUpdatedCount || 0
        }
        const ctx = getAdminContext(req)
        if (ctx && storeId) {
          const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId })
          if (okPrimary) {
            await recordStoreSyncChange({
              manager,
              tenantId: ctx.tenantId,
              sourceStoreId: storeId,
              entityType: 'GOOD',
              entityTemplateId: (row as any).templateId || row.goodId,
              action: 'UPSERT',
              name: row.name,
              changedByUserId: user?.userId || null
            })
          }
        }
        return { goodId, skuRebuild }
      })
      created(res, { goodId: result.goodId, skuRebuild: result.skuRebuild }, 'Created')
    } catch (e: any) {
      const httpStatus = Number(e?.httpStatus) || 500
      const code = Number(e?.code) || 50000
      const message = typeof e?.message === 'string' ? e.message : 'Internal Server Error'
      res.status(httpStatus).json({ success: false, code, message, data: null })
    }
  })
)

router.put(
  '/api/v1/goods/:goodId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { goodId } = req.params
    const user = getAuthUser(req)
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    const storeId = resolved.storeId
    if (!ctx.canManageSharedCatalog) {
      const allowedKeys = new Set(['status', 'defaultSkuId'])
      for (const k of Object.keys(req.body || {})) {
        if (!allowedKeys.has(k) && (req.body as any)[k] !== undefined) {
          res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
          return
        }
      }
    }
    try {
      const result = await AppDataSource.transaction(async (manager) => {
        const fail = (httpStatus: number, code: number, message: string): never => {
          const err: any = new Error(message)
          err.httpStatus = httpStatus
          err.code = code
          throw err
        }
        const repo = manager.getRepository(Good)
        const mapRepo = manager.getRepository(GoodCategory)
        const row = await repo.findOne({ where: { goodId, storeId } })
        if (!row) fail(404, 40400, 'Good not found')
        const g = row!
        const prevBasePrice = String(g.basePrice || '0')
        const {
          categoryId,
          categoryIds,
          name,
          description,
          detailMarkdown,
          status,
          optionGroups,
          basePriceCents,
          defaultSkuId
        } = req.body || {}
        const requestedDefaultSkuId = defaultSkuId !== undefined ? String(defaultSkuId || '').trim() : undefined
        if (requestedDefaultSkuId !== undefined && !requestedDefaultSkuId) fail(400, 40000, 'Invalid defaultSkuId')
        let catIds: string[] | null = null
        if (Array.isArray(categoryIds)) {
          catIds = Array.from(
            new Set(categoryIds.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()))
          )
          if (!catIds.length) fail(400, 40000, 'Invalid categoryIds')
        } else if (categoryIds !== undefined) {
          fail(400, 40000, 'Invalid categoryIds')
        } else if (categoryId !== undefined) {
          if (typeof categoryId !== 'string' || !categoryId.trim()) fail(400, 40000, 'Invalid categoryId')
          catIds = [categoryId.trim()]
        }
        if (catIds) g.categoryId = catIds[0]
        if (name !== undefined) g.name = name
        if (description !== undefined) g.description = description
        if (detailMarkdown !== undefined) g.detailMarkdown = typeof detailMarkdown === 'string' ? detailMarkdown : null
        if (req.body?.imageUrls !== undefined) {
          const imageUrls = parseImageUrlsFromBody(req.body)
          g.imageUrls = imageUrls.length ? JSON.stringify(imageUrls) : null
        }
        if (basePriceCents !== undefined) {
          let cents = 0n
          try {
            cents = parseBasePriceCentsInput(basePriceCents)
          } catch {
            fail(400, 40000, 'Invalid basePrice')
          }
          g.basePrice = cents.toString()
        }
        if (status !== undefined) g.status = status
        await repo.save(g)
        if (catIds) {
          const existing = await mapRepo.find({ where: { storeId, goodId: g.goodId } })
          const existingByCategoryId = new Map(existing.map((x) => [x.categoryId, x]))
          const nextSet = new Set(catIds)
          const toRemove = existing.filter((x) => !nextSet.has(x.categoryId)).map((x) => x.categoryId)
          if (toRemove.length) await mapRepo.delete({ storeId, goodId: g.goodId, categoryId: In(toRemove) })
          const toInsert = catIds.filter((cid) => !existingByCategoryId.has(cid))
          if (toInsert.length) {
            await mapRepo.insert(
              toInsert.map((c) => ({ storeId: g.storeId, goodId: g.goodId, categoryId: c, sort: 0 }))
            )
          }
        }

        let skuRebuild: any = null
        if (optionGroups !== undefined) {
          if (requestedDefaultSkuId !== undefined) fail(400, 40000, 'Cannot set defaultSkuId while rebuilding SKUs')
          const { shared, custom } = splitSharedOptionGroups(optionGroups)
          const linkRepo = manager.getRepository(GoodSharedSpecGroup)
          const sharedRepo = manager.getRepository(SharedSpecGroup)
          const sharedOptRepo = manager.getRepository(SharedSpecOption)
          const existingLinks = await linkRepo.find({ where: { storeId, goodId } })
          const existingById = new Map(existingLinks.map((x) => [x.sharedSpecGroupId, x]))
          const nextIds = new Set(shared.map((x) => x.sharedSpecGroupId))
          if (shared.length) {
            const ids = Array.from(nextIds)
            const sharedRows = await sharedRepo.find({
              where: { storeId, sharedSpecGroupId: In(ids), status: 'ACTIVE' }
            })
            if (sharedRows.length !== ids.length) fail(400, 40000, 'Invalid sharedSpecGroupId')
            const sharedById = new Map(sharedRows.map((x) => [x.sharedSpecGroupId, x]))
            const opts = await sharedOptRepo.find({ where: { sharedSpecGroupId: In(ids), status: 'ACTIVE' } })
            const optionIdsByGroupId = new Map<string, Set<string>>()
            for (const o of opts) {
              const set = optionIdsByGroupId.get(o.sharedSpecGroupId) || new Set()
              set.add(o.optionId)
              optionIdsByGroupId.set(o.sharedSpecGroupId, set)
            }
            for (const s of shared) {
              const g2 = sharedById.get(s.sharedSpecGroupId)
              if (!g2) fail(400, 40000, 'Invalid sharedSpecGroupId')
              const allowed = optionIdsByGroupId.get(s.sharedSpecGroupId) || new Set()
              const disabled = Array.from(new Set((s.disabledOptionIds || []).filter((id) => allowed.has(id))))
              if (disabled.length !== (s.disabledOptionIds || []).length) fail(400, 40000, 'Invalid disabledOptionIds')
              const enabledCount = Math.max(0, allowed.size - disabled.length)
              const min = minSelectionForGroup({ isRequired: g2!.isRequired, minSelection: g2!.minSelection })
              if (min > 0 && enabledCount < min) fail(400, 40000, 'Invalid disabledOptionIds')
              const linkDefault = Array.from(
                new Set((s.defaultOptionIds || []).filter((id) => allowed.has(id) && !disabled.includes(id)))
              )
              if (linkDefault.length !== (s.defaultOptionIds || []).length) fail(400, 40000, 'Invalid defaultOptionIds')
              if (linkDefault.length) {
                if (linkDefault.length > g2!.maxSelection) fail(400, 40000, 'Invalid defaultOptionIds')
                if (linkDefault.length < min) fail(400, 40000, 'Invalid defaultOptionIds')
              }
            }
          }
          const toRemove = existingLinks
            .filter((x) => !nextIds.has(x.sharedSpecGroupId))
            .map((x) => x.sharedSpecGroupId)
          if (toRemove.length) await linkRepo.delete({ goodId, sharedSpecGroupId: In(toRemove) })
          const toInsert = shared.filter((x) => !existingById.has(x.sharedSpecGroupId))
          if (toInsert.length) {
            await linkRepo.insert(
              toInsert.map((s) => ({
                storeId: g.storeId,
                goodId,
                sharedSpecGroupId: s.sharedSpecGroupId,
                disabledOptionIds: s.disabledOptionIds?.length ? JSON.stringify(s.disabledOptionIds) : null,
                defaultOptionIds: s.defaultOptionIds?.length ? JSON.stringify(s.defaultOptionIds) : null,
                sort: s.sort
              }))
            )
          }
          const toUpdate = shared.filter((x) => existingById.has(x.sharedSpecGroupId))
          if (toUpdate.length) {
            for (const s of toUpdate) {
              const row = existingById.get(s.sharedSpecGroupId)
              if (!row) continue
              const nextDisabled = s.disabledOptionIds?.length ? JSON.stringify(s.disabledOptionIds) : null
              const nextDefault = s.defaultOptionIds?.length ? JSON.stringify(s.defaultOptionIds) : null
              if (
                row.sort !== s.sort ||
                (row as any).disabledOptionIds !== nextDisabled ||
                (row as any).defaultOptionIds !== nextDefault
              ) {
                row.sort = s.sort
                ;(row as any).disabledOptionIds = nextDisabled
                ;(row as any).defaultOptionIds = nextDefault
                await linkRepo.save(row)
              }
            }
          }
          const r = await GoodService.upsertOptionGroupsAndGenerateSkus({
            manager,
            goodId,
            basePriceCents: BigInt(g.basePrice || '0'),
            optionGroups: custom,
            operator: { userId: user?.userId || 'unknown', role: user?.role || 'UNKNOWN' }
          })
          if (!r.ok) fail(r.httpStatus, r.code, r.message)
          const rr = r as Extract<typeof r, { ok: true }>
          skuRebuild = {
            skuRebuilt: rr.skuRebuilt,
            skuDeletedCount: rr.skuDeletedCount,
            skuCreatedCount: rr.skuCreatedCount,
            skuPriceUpdatedCount: rr.skuPriceUpdatedCount || 0
          }
          if (rr.skuRebuilt) {
            const skuRepo = manager.getRepository(SKU)
            const firstSku = await skuRepo.findOne({ where: { goodId }, order: { id: 'ASC' } })
            g.defaultSkuId = firstSku?.skuId || null
            await repo.save(g)
          }
          if (!rr.skuRebuilt && String(g.basePrice || '0') !== prevBasePrice && skuRebuild.skuPriceUpdatedCount === 0) {
            const rp = await GoodService.repriceSkusFromOptionGroupsBySpecText({
              manager,
              goodId,
              basePriceCents: BigInt(String(g.basePrice || '0')),
              optionGroups: custom
            })
            if (!rp.ok) fail(rp.httpStatus, rp.code, rp.message)
            skuRebuild.skuPriceUpdatedCount = rp.skuPriceUpdatedCount
          }
        } else if (String(g.basePrice || '0') !== prevBasePrice) {
          const delta = BigInt(String(g.basePrice || '0')) - BigInt(prevBasePrice || '0')
          if (delta !== 0n) {
            const skuRepo = manager.getRepository(SKU)
            await skuRepo
              .createQueryBuilder()
              .update(SKU)
              .set({ price: () => `price + ${delta.toString()}` })
              .where('goodId = :goodId', { goodId })
              .execute()
          }
        }
        if (requestedDefaultSkuId !== undefined) {
          const skuRepo = manager.getRepository(SKU)
          const target = await skuRepo.findOne({ where: { skuId: requestedDefaultSkuId, goodId } })
          if (!target) fail(400, 40000, 'Invalid defaultSkuId')
          g.defaultSkuId = target!.skuId
          await repo.save(g)
        } else if (!g.defaultSkuId) {
          const skuRepo = manager.getRepository(SKU)
          const firstSku = await skuRepo.findOne({ where: { goodId }, order: { id: 'ASC' } })
          if (firstSku?.skuId) {
            g.defaultSkuId = firstSku.skuId
            await repo.save(g)
          }
        }
        const ctx = getAdminContext(req)
        if (ctx && storeId) {
          const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId })
          if (okPrimary) {
            await recordStoreSyncChange({
              manager,
              tenantId: ctx.tenantId,
              sourceStoreId: storeId,
              entityType: 'GOOD',
              entityTemplateId: (g as any).templateId || g.goodId,
              action: 'UPSERT',
              name: g.name,
              changedByUserId: user?.userId || null
            })
          }
        }
        return { goodId, skuRebuild }
      })
      ok(res, { goodId: result.goodId, skuRebuild: result.skuRebuild }, 'Updated')
    } catch (e: any) {
      const httpStatus = Number(e?.httpStatus) || 500
      const code = Number(e?.code) || 50000
      const message = typeof e?.message === 'string' ? e.message : 'Internal Server Error'
      res.status(httpStatus).json({ success: false, code, message, data: null })
    }
  })
)

router.delete(
  '/api/v1/goods/:goodId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { goodId } = req.params
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    const resolved = await resolveTenantAndStore({ tenantId: ctx.tenantId, storeId: ctx.storeId })
    if (!resolved.tenant || !resolved.storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    const storeId = resolved.storeId
    if (!ctx.canManageSharedCatalog) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const okPrimary = await isPrimaryStore({ manager: AppDataSource.manager, tenantId: ctx.tenantId, storeId })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const repo = AppDataSource.getRepository(Good)
    const row = await repo.findOne({ where: { goodId, storeId } })
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'Good not found', data: null })
      return
    }
    row.status = 'OFF_SHELF'
    await repo.save(row)
    await recordStoreSyncChange({
      manager: AppDataSource.manager,
      tenantId: ctx.tenantId,
      sourceStoreId: storeId,
      entityType: 'GOOD',
      entityTemplateId: (row as any).templateId || row.goodId,
      action: 'DELETE',
      name: row.name,
      changedByUserId: (req as any)?.user?.userId || null
    })
    ok(res, { goodId }, 'Deleted')
  })
)

router.get(
  '/api/v1/skus',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const goodId = typeof req.query.goodId === 'string' ? req.query.goodId : undefined
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '10'), 10) || 10))
    const storeId = getActiveStoreId(req)

    const goodRepo = AppDataSource.getRepository(Good)
    if (goodId) {
      const good = await goodRepo.findOne({ where: { goodId, storeId } })
      if (!good) {
        res.status(404).json({ success: false, code: 40400, message: 'Good not found', data: null })
        return
      }
    }
    const repo = AppDataSource.getRepository(SKU)
    const qb = repo
      .createQueryBuilder('s')
      .innerJoin(Good, 'g', 'g.goodId = s.goodId AND g.deletedAt IS NULL')
      .where('s.deletedAt IS NULL')
      .andWhere('g.storeId = :storeId', { storeId })
    if (goodId) qb.andWhere('s.goodId = :goodId', { goodId })
    if (keyword) qb.andWhere('(s.skuId LIKE :kw OR s.specCombination LIKE :kw)', { kw: `%${keyword}%` })
    qb.orderBy('s.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [rows, total] = await qb.getManyAndCount()
    ok(res, {
      list: rows.map((s) => ({
        skuId: s.skuId,
        goodId: s.goodId,
        specCombination: s.specCombination,
        priceCents: Number(String(s.price || '0')),
        stock: s.stock,
        status: s.status
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.post(
  '/api/v1/skus',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { goodId, specCombination = '', priceCents, stock = 0, status = 'OFF_SHELF' } = req.body || {}
    if (!goodId || typeof goodId !== 'string' || priceCents === undefined) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    const storeId = getActiveStoreId(req)
    const goodRepo = AppDataSource.getRepository(Good)
    const good = await goodRepo.findOne({ where: { goodId, storeId } })
    if (!good) {
      res.status(404).json({ success: false, code: 40400, message: 'Good not found', data: null })
      return
    }
    let cents = 0n
    try {
      cents = parsePriceCentsInput(priceCents)
    } catch {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid price', data: null })
      return
    }
    const stockInt = Number(stock)
    if (!Number.isInteger(stockInt) || stockInt < 0) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid stock', data: null })
      return
    }
    const repo = AppDataSource.getRepository(SKU)
    const skuId = genId('sku')
    const row = repo.create({ skuId, goodId, specCombination, price: cents.toString(), stock: stockInt, status })
    await repo.save(row)
    await goodRepo
      .createQueryBuilder()
      .update(Good)
      .set({ defaultSkuId: skuId })
      .where('goodId = :goodId', { goodId })
      .andWhere("(default_sku_id IS NULL OR default_sku_id = '')")
      .execute()
    created(res, { skuId }, 'Created')
  })
)

router.put(
  '/api/v1/skus/bulk',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { skuIds, stock, stockDelta, status } = req.body || {}
    if (!Array.isArray(skuIds) || skuIds.length === 0 || skuIds.some((x) => typeof x !== 'string' || !x)) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid skuIds', data: null })
      return
    }
    const hasStock = stock !== undefined
    const hasDelta = stockDelta !== undefined
    const hasStatus = status !== undefined
    if (!hasStock && !hasDelta && !hasStatus) {
      res.status(400).json({ success: false, code: 40000, message: 'No fields to update', data: null })
      return
    }
    if (hasStock && hasDelta) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid stock params', data: null })
      return
    }
    const update: any = {}
    if (hasStock) {
      const n = Number(stock)
      if (!Number.isInteger(n) || n < 0) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid stock', data: null })
        return
      }
      update.stock = n
    }
    if (hasStatus) update.status = status
    let delta = 0
    if (hasDelta) {
      delta = Number(stockDelta)
      if (!Number.isInteger(delta) || delta === 0) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid stockDelta', data: null })
        return
      }
    }

    const repo = AppDataSource.getRepository(SKU)
    const storeId = getActiveStoreId(req)
    const validRows = await repo
      .createQueryBuilder('s')
      .select('s.skuId', 'skuId')
      .innerJoin(Good, 'g', 'g.goodId = s.goodId AND g.deletedAt IS NULL')
      .where('s.deletedAt IS NULL')
      .andWhere('g.storeId = :storeId', { storeId })
      .andWhere('s.skuId IN (:...skuIds)', { skuIds })
      .getRawMany()
    const validIds = validRows.map((r: any) => String(r.skuId)).filter(Boolean)
    if (validIds.length !== skuIds.length) {
      res.status(404).json({ success: false, code: 40400, message: 'SKU not found', data: null })
      return
    }
    let affected = 0
    const chunkSize = 500
    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize)
      let qb = repo.createQueryBuilder().update(SKU).where('skuId IN (:...skuIds)', { skuIds: chunk })
      if (hasDelta) {
        qb = qb.set({ ...update, stock: () => 'GREATEST(stock + :delta, 0)' }).setParameter('delta', delta)
      } else {
        qb = qb.set(update)
      }
      const r: any = await qb.execute()
      affected += Number(r.affected || 0)
    }
    ok(res, { affected, skuIdsCount: skuIds.length }, 'Bulk updated')
  })
)

router.put(
  '/api/v1/skus/:skuId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { skuId } = req.params
    const repo = AppDataSource.getRepository(SKU)
    const storeId = getActiveStoreId(req)
    const row = await repo
      .createQueryBuilder('s')
      .innerJoin(Good, 'g', 'g.goodId = s.goodId AND g.deletedAt IS NULL')
      .where('s.deletedAt IS NULL')
      .andWhere('s.skuId = :skuId', { skuId })
      .andWhere('g.storeId = :storeId', { storeId })
      .getOne()
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'SKU not found', data: null })
      return
    }
    const { specCombination, priceCents, stock, status } = req.body || {}
    if (specCombination !== undefined) row.specCombination = specCombination
    if (priceCents !== undefined) {
      let cents = 0n
      try {
        cents = parsePriceCentsInput(priceCents)
      } catch {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid price', data: null })
        return
      }
      row.price = cents.toString()
    }
    if (stock !== undefined) {
      const n = Number(stock)
      if (!Number.isInteger(n) || n < 0) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid stock', data: null })
        return
      }
      row.stock = n
    }
    if (status !== undefined) row.status = status
    await repo.save(row)
    ok(res, { skuId }, 'Updated')
  })
)

router.delete(
  '/api/v1/skus/:skuId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { skuId } = req.params
    const repo = AppDataSource.getRepository(SKU)
    const storeId = getActiveStoreId(req)
    const row = await repo
      .createQueryBuilder('s')
      .innerJoin(Good, 'g', 'g.goodId = s.goodId AND g.deletedAt IS NULL')
      .where('s.deletedAt IS NULL')
      .andWhere('s.skuId = :skuId', { skuId })
      .andWhere('g.storeId = :storeId', { storeId })
      .getOne()
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'SKU not found', data: null })
      return
    }
    row.status = 'OFF_SHELF'
    await repo.save(row)
    ok(res, { skuId }, 'Deleted')
  })
)

export default router
