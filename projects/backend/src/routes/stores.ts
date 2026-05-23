import { Router, Request, Response } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { In } from 'typeorm'
import { AppDataSource } from '../db'
import { Category } from '../entities/Category'
import { Good } from '../entities/Good'
import { GoodCategory } from '../entities/GoodCategory'
import { GoodSpecChangeLog } from '../entities/GoodSpecChangeLog'
import { Notification } from '../entities/Notification'
import { Order } from '../entities/Order'
import { OrderItem } from '../entities/OrderItem'
import { PaymentTransaction } from '../entities/PaymentTransaction'
import { RefundTransaction } from '../entities/RefundTransaction'
import { SKU } from '../entities/SKU'
import { SpecGroup } from '../entities/SpecGroup'
import { SpecOption } from '../entities/SpecOption'
import { SharedSpecGroup } from '../entities/SharedSpecGroup'
import { SharedSpecOption } from '../entities/SharedSpecOption'
import { GoodSharedSpecGroup } from '../entities/GoodSharedSpecGroup'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { Table } from '../entities/Table'
import { TableCart } from '../entities/TableCart'
import { TableCartItem } from '../entities/TableCartItem'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { getActiveStoreId, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { buildPublicUrl, cosPutObject } from '../qcloud/cos'
import { closeTableSession } from '../ws/tableSession'
import { setStoreMaintenanceState } from '../services/maintenance'
import { genId } from '../utils/id'
import { buildStoreDisplayName } from '../utils/storeName'
import { config } from '../config'
import { generateTableMiniProgramQrcode } from '../services/wechatMiniProgramQrcode'
import { generateTableH5Qrcode } from '../services/h5Qrcode'

const router = Router()

type StoreExportV2 = {
  version: 2
  exportedAt: string
  store: {
    storeId: string
    name: string
    subName?: string | null
    logoUrl: string
    phone: string
    address: string
    description: string
  }
  categories: Array<{
    categoryId: string
    storeId: string
    templateId?: string | null
    name: string
    subtitle: string | null
    badgeText: string | null
    sort: number
    status: string
  }>
  goods: Array<{
    goodId: string
    storeId: string
    templateId?: string | null
    categoryId: string
    categoryIds: string[]
    categorySortById?: Record<string, number>
    defaultSkuId: string | null
    name: string
    description: string
    detailMarkdown: string | null
    imageUrls: string | null
    sales: number
    basePrice: string
    status: string
  }>
  skus: Array<{
    skuId: string
    goodId: string
    specCombination: string
    specKey: string | null
    specSignature: string | null
    price: string
    stock: number
    status: string
  }>
  specGroups: Array<{
    specGroupId: string
    templateId?: string | null
    goodId: string
    name: string
    isRequired: number
    minSelection: number
    maxSelection: number
    sort: number
    isStock?: boolean
    defaultOptionIds?: string[]
    status: string
  }>
  specOptions: Array<{
    optionId: string
    templateId?: string | null
    specGroupId: string
    name: string
    priceCents: string
    sort: number
    status: string
  }>
  sharedSpecGroups: Array<{
    sharedSpecGroupId: string
    storeId: string
    templateId?: string | null
    name: string
    description?: string | null
    isRequired: number
    minSelection: number
    maxSelection: number
    sort: number
    defaultOptionIds?: string[]
    status: string
  }>
  sharedSpecOptions: Array<{
    optionId: string
    sharedSpecGroupId: string
    templateId?: string | null
    name: string
    priceCents: string
    sort: number
    status: string
  }>
  goodSharedSpecGroups: Array<{
    storeId: string
    goodId: string
    sharedSpecGroupId: string
    disabledOptionIds?: string[]
    defaultOptionIds?: string[]
    sort: number
  }>
  tables: Array<{
    tableId: string
    storeId: string
    code: string
    qrcodeUrl: string | null
    h5QrcodeUrl: string | null
  }>
}

function ymd() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function normalizeCategoryIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim())))
}

function parseStoreExport(input: unknown): StoreExportV2 {
  if (!input || typeof input !== 'object') throw new Error('Invalid JSON')
  const o = input as any
  if (Number(o.version) !== 2) throw new Error('Unsupported version')
  const store = o.store
  if (!store || typeof store !== 'object') throw new Error('Invalid store')
  const storeId = String(store.storeId || '')
  if (!storeId) throw new Error('Invalid store.storeId')
  const categories = Array.isArray(o.categories) ? o.categories : null
  const goods = Array.isArray(o.goods) ? o.goods : null
  const skus = Array.isArray(o.skus) ? o.skus : null
  const specGroups = Array.isArray(o.specGroups) ? o.specGroups : null
  const specOptions = Array.isArray(o.specOptions) ? o.specOptions : null
  const tables = Array.isArray(o.tables) ? o.tables : null
  const sharedSpecGroups = Array.isArray(o.sharedSpecGroups) ? o.sharedSpecGroups : []
  const sharedSpecOptions = Array.isArray(o.sharedSpecOptions) ? o.sharedSpecOptions : []
  const goodSharedSpecGroups = Array.isArray(o.goodSharedSpecGroups) ? o.goodSharedSpecGroups : []
  if (!categories || !goods || !skus || !specGroups || !specOptions || !tables) throw new Error('Invalid lists')

  const catIds = new Set<string>()
  for (const c of categories) {
    const id = String(c?.categoryId || '')
    if (!id) throw new Error('Invalid categoryId')
    catIds.add(id)
  }
  const goodIds = new Set<string>()
  for (const g of goods) {
    const id = String(g?.goodId || '')
    if (!id) throw new Error('Invalid goodId')
    const primary = String(g?.categoryId || '')
    const categoryIds = normalizeCategoryIds(g?.categoryIds)
    const ids = categoryIds.length ? categoryIds : primary ? [primary] : []
    if (!ids.length) throw new Error('Invalid good.categoryId')
    for (const cid of ids) {
      if (!catIds.has(cid)) throw new Error('Invalid good.categoryIds')
    }
    goodIds.add(id)
  }
  for (const s of skus) {
    const id = String(s?.skuId || '')
    const goodId = String(s?.goodId || '')
    if (!id) throw new Error('Invalid skuId')
    if (!goodId || !goodIds.has(goodId)) throw new Error('Invalid sku.goodId')
  }
  const groupIds = new Set<string>()
  for (const sg of specGroups) {
    const id = String(sg?.specGroupId || '')
    const goodId = String(sg?.goodId || '')
    if (!id) throw new Error('Invalid specGroupId')
    if (!goodId || !goodIds.has(goodId)) throw new Error('Invalid specGroup.goodId')
    groupIds.add(id)
  }
  for (const so of specOptions) {
    const id = String(so?.optionId || '')
    const gid = String(so?.specGroupId || '')
    if (!id) throw new Error('Invalid optionId')
    if (!gid || !groupIds.has(gid)) throw new Error('Invalid specOption.specGroupId')
  }
  const sharedGroupIds = new Set<string>()
  for (const sg of sharedSpecGroups) {
    const id = String(sg?.sharedSpecGroupId || '')
    if (!id) throw new Error('Invalid sharedSpecGroupId')
    sharedGroupIds.add(id)
  }
  for (const so of sharedSpecOptions) {
    const id = String(so?.optionId || '')
    const gid = String(so?.sharedSpecGroupId || '')
    if (!id) throw new Error('Invalid sharedSpecOption.optionId')
    if (!gid || !sharedGroupIds.has(gid)) throw new Error('Invalid sharedSpecOption.sharedSpecGroupId')
  }
  for (const link of goodSharedSpecGroups) {
    const gid = String(link?.goodId || '')
    const ssgid = String(link?.sharedSpecGroupId || '')
    if (!gid || !goodIds.has(gid)) throw new Error('Invalid goodSharedSpecGroup.goodId')
    if (!ssgid || !sharedGroupIds.has(ssgid)) throw new Error('Invalid goodSharedSpecGroup.sharedSpecGroupId')
  }
  for (const t of tables) {
    const id = String(t?.tableId || '')
    const code = String(t?.code || '')
    if (!id) throw new Error('Invalid tableId')
    if (!code) throw new Error('Invalid table.code')
  }

  return {
    ...(o as StoreExportV2),
    sharedSpecGroups,
    sharedSpecOptions,
    goodSharedSpecGroups
  }
}

const jsonStorage = multer.memoryStorage()
const jsonUpload = multer({ storage: jsonStorage, limits: { fileSize: 10 * 1024 * 1024 } })

async function clearStoreData(em: typeof AppDataSource.manager, storeId: string) {
  const tableRepo = em.getRepository(Table)
  const existingTables = await tableRepo.find({ select: { tableId: true } as any, where: { storeId } as any })
  for (const t of existingTables) closeTableSession((t as any).tableId)

  const orderRepo = em.getRepository(Order)
  const orders = await orderRepo.find({ select: { orderId: true } as any, where: { storeId } as any })
  const orderIds = orders.map((o) => (o as any).orderId).filter(Boolean)
  if (orderIds.length) {
    await em.getRepository(OrderItem).delete({ orderId: In(orderIds) } as any)
    await em.getRepository(PaymentTransaction).delete({ orderId: In(orderIds) } as any)
    await em.getRepository(RefundTransaction).delete({ orderId: In(orderIds) } as any)
  }
  await orderRepo.delete({ storeId } as any)
  await em.getRepository(Notification).delete({ storeId } as any)

  const cartRepo = em.getRepository(TableCart)
  const carts = await cartRepo.find({ select: { cartId: true } as any, where: { storeId } as any })
  const cartIds = carts.map((c) => (c as any).cartId).filter(Boolean)
  if (cartIds.length) await em.getRepository(TableCartItem).delete({ cartId: In(cartIds) } as any)
  await cartRepo.delete({ storeId } as any)

  const goodRepo = em.getRepository(Good)
  const goods = await goodRepo.find({ select: { goodId: true } as any, where: { storeId } as any })
  const goodIds = goods.map((g) => (g as any).goodId).filter(Boolean)
  if (goodIds.length) await em.getRepository(GoodSpecChangeLog).delete({ goodId: In(goodIds) } as any)

  if (goodIds.length) {
    const groupRepo = em.getRepository(SpecGroup)
    const groups = await groupRepo.find({ select: { specGroupId: true } as any, where: { goodId: In(goodIds) } as any })
    const groupIds = groups.map((g) => (g as any).specGroupId).filter(Boolean)
    if (groupIds.length) await em.getRepository(SpecOption).delete({ specGroupId: In(groupIds) } as any)
    await groupRepo.delete({ goodId: In(goodIds) } as any)
    await em.getRepository(SKU).delete({ goodId: In(goodIds) } as any)
    await em.getRepository(GoodCategory).delete({ storeId, goodId: In(goodIds) } as any)
    await em.getRepository(GoodSharedSpecGroup).delete({ storeId, goodId: In(goodIds) } as any)
  }

  const sharedGroupRepo = em.getRepository(SharedSpecGroup)
  const sharedGroups = await sharedGroupRepo.find({
    select: { sharedSpecGroupId: true } as any,
    where: { storeId } as any
  })
  const sharedGroupIds = sharedGroups.map((g) => (g as any).sharedSpecGroupId).filter(Boolean)
  if (sharedGroupIds.length)
    await em.getRepository(SharedSpecOption).delete({ sharedSpecGroupId: In(sharedGroupIds) } as any)
  await sharedGroupRepo.delete({ storeId } as any)

  await goodRepo.delete({ storeId } as any)
  await em.getRepository(Category).delete({ storeId } as any)
  await tableRepo.delete({ storeId } as any)
}

function mapIdList(raw: unknown, map: Map<string, string>) {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const k = String(v || '')
    if (!k) continue
    const nv = map.get(k)
    if (nv) out.push(nv)
  }
  return out
}

type ApplyStoreCloneOptions = {
  /**
   * Cross-store templateId remap. When a child store's templateId references an
   * id from another store in the same snapshot (e.g. primary store of a chain
   * tenant), the caller can provide the old→new id map so templateIds retain
   * valid linkage after re-import.
   */
  externalTemplateIdMap?: Map<string, string>
}

function remapTemplateId(
  value: string | null | undefined,
  externalMap: Map<string, string> | undefined
): string | null {
  if (!value) return null
  if (externalMap && externalMap.has(value)) return externalMap.get(value)!
  return value
}

async function applyStoreConfigClone(
  em: typeof AppDataSource.manager,
  storeId: string,
  data: StoreExportV2,
  options?: ApplyStoreCloneOptions
) {
  const storeRepo = em.getRepository(Store)
  let store = await storeRepo.findOne({ where: { storeId } })
  const subNameRaw =
    data.store && Object.prototype.hasOwnProperty.call(data.store, 'subName') ? (data.store as any).subName : undefined
  const subNameProvided = subNameRaw !== undefined
  const subNameValue = typeof subNameRaw === 'string' && subNameRaw ? subNameRaw : null
  if (!store) {
    store = storeRepo.create({
      storeId,
      tenantId: storeId,
      isPrimary: 1,
      subName: subNameProvided ? subNameValue : null,
      name: data.store.name,
      logoUrl: data.store.logoUrl,
      phone: data.store.phone,
      address: data.store.address,
      description: data.store.description
    })
  } else {
    store.name = data.store.name
    store.logoUrl = data.store.logoUrl
    store.phone = data.store.phone
    store.address = data.store.address
    store.description = data.store.description
    if (subNameProvided) store.subName = subNameValue
  }
  await storeRepo.save(store)

  await clearStoreData(em, storeId)

  const externalMap = options?.externalTemplateIdMap
  const categoryIdMap = new Map<string, string>()
  for (const c of data.categories) categoryIdMap.set(c.categoryId, genId('cat'))
  const goodIdMap = new Map<string, string>()
  for (const g of data.goods) goodIdMap.set(g.goodId, genId('good'))
  const skuIdMap = new Map<string, string>()
  for (const s of data.skus) skuIdMap.set(s.skuId, genId('sku'))
  const specGroupIdMap = new Map<string, string>()
  for (const g of data.specGroups) specGroupIdMap.set(g.specGroupId, genId('sg'))
  const specOptionIdMap = new Map<string, string>()
  for (const o of data.specOptions) specOptionIdMap.set(o.optionId, genId('so'))
  const sharedGroupIdMap = new Map<string, string>()
  for (const g of data.sharedSpecGroups) sharedGroupIdMap.set(g.sharedSpecGroupId, genId('ssg'))
  const sharedOptionIdMap = new Map<string, string>()
  for (const o of data.sharedSpecOptions) sharedOptionIdMap.set(o.optionId, genId('sso'))
  const tableIdMap = new Map<string, string>()
  for (const t of data.tables) tableIdMap.set(t.tableId, genId('tbl'))

  if (data.categories.length) {
    await em.getRepository(Category).insert(
      data.categories.map((c) => ({
        categoryId: categoryIdMap.get(c.categoryId)!,
        storeId,
        templateId: remapTemplateId((c as any).templateId, externalMap),
        name: c.name,
        subtitle: c.subtitle || null,
        badgeText: c.badgeText || null,
        sort: Number(c.sort || 0) || 0,
        status: c.status || 'ACTIVE'
      }))
    )
  }

  if (data.goods.length) {
    await em.getRepository(Good).insert(
      data.goods.map((g) => {
        const mappedCategoryIds = mapIdList(g.categoryIds, categoryIdMap)
        const primary = mappedCategoryIds.length
          ? mappedCategoryIds[0]
          : categoryIdMap.get(g.categoryId) || mappedCategoryIds[0]
        return {
          goodId: goodIdMap.get(g.goodId)!,
          storeId,
          templateId: remapTemplateId((g as any).templateId, externalMap),
          categoryId: primary || Array.from(categoryIdMap.values())[0],
          defaultSkuId: g.defaultSkuId ? skuIdMap.get(g.defaultSkuId) || null : null,
          name: g.name,
          description: g.description || '',
          detailMarkdown: g.detailMarkdown || null,
          imageUrls: g.imageUrls || null,
          sales: 0,
          basePrice: g.basePrice || '0',
          status: g.status || 'OFF_SHELF'
        }
      })
    )
    const maps: Array<{ storeId: string; goodId: string; categoryId: string; sort: number }> = []
    for (const g of data.goods) {
      const gid = goodIdMap.get(g.goodId)!
      const mappedCategoryIds = mapIdList(g.categoryIds, categoryIdMap)
      const sortById: Record<string, number> =
        (g as any).categorySortById && typeof (g as any).categorySortById === 'object'
          ? (g as any).categorySortById
          : {}
      for (const oldCid of Array.from(new Set((g.categoryIds || []).filter((x) => x)))) {
        const newCid = categoryIdMap.get(String(oldCid))
        if (!newCid) continue
        if (!mappedCategoryIds.includes(newCid)) continue
        maps.push({ storeId, goodId: gid, categoryId: newCid, sort: Number(sortById[String(oldCid)] || 0) || 0 })
      }
      if (!maps.some((m) => m.goodId === gid) && mappedCategoryIds.length) {
        maps.push({ storeId, goodId: gid, categoryId: mappedCategoryIds[0]!, sort: 0 })
      }
    }
    if (maps.length) await em.getRepository(GoodCategory).insert(maps)
  }

  if (data.skus.length) {
    await em.getRepository(SKU).insert(
      data.skus.map((s) => ({
        skuId: skuIdMap.get(s.skuId)!,
        goodId: goodIdMap.get(s.goodId)!,
        specCombination: s.specCombination,
        specKey: s.specKey || null,
        specSignature: s.specSignature || null,
        price: s.price || '0',
        stock: Number(s.stock || 0) || 0,
        status: s.status || 'OFF_SHELF'
      }))
    )
  }

  if (data.specGroups.length) {
    await em.getRepository(SpecGroup).insert(
      data.specGroups.map((x) => ({
        specGroupId: specGroupIdMap.get(x.specGroupId)!,
        templateId: remapTemplateId((x as any).templateId, externalMap),
        goodId: goodIdMap.get(x.goodId)!,
        name: x.name,
        isRequired: Number(x.isRequired || 0) ? 1 : 0,
        minSelection: Number(x.minSelection || 0) || 0,
        maxSelection: Number(x.maxSelection || 0) || 0,
        sort: Number(x.sort || 0) || 0,
        isStock: (x as any).isStock === false || String((x as any).isStock || '') === '0' ? 0 : 1,
        defaultOptionIds: (() => {
          const mapped = mapIdList((x as any).defaultOptionIds, specOptionIdMap)
          return mapped.length ? JSON.stringify(mapped) : null
        })(),
        status: x.status || 'ACTIVE'
      }))
    )
  }

  if (data.specOptions.length) {
    await em.getRepository(SpecOption).insert(
      data.specOptions.map((x) => ({
        optionId: specOptionIdMap.get(x.optionId)!,
        templateId: remapTemplateId((x as any).templateId, externalMap),
        specGroupId: specGroupIdMap.get(x.specGroupId)!,
        name: x.name,
        priceCents: x.priceCents || '0',
        sort: Number(x.sort || 0) || 0,
        status: x.status || 'ACTIVE'
      }))
    )
  }

  if (data.sharedSpecGroups.length) {
    await em.getRepository(SharedSpecGroup).insert(
      data.sharedSpecGroups.map((x) => ({
        sharedSpecGroupId: sharedGroupIdMap.get(x.sharedSpecGroupId)!,
        storeId,
        templateId: remapTemplateId((x as any).templateId, externalMap),
        name: x.name,
        description: typeof (x as any).description === 'string' ? String((x as any).description) : null,
        isRequired: Number(x.isRequired || 0) ? 1 : 0,
        minSelection: Number(x.minSelection || 0) || 0,
        maxSelection: Number(x.maxSelection || 0) || 0,
        sort: Number(x.sort || 0) || 0,
        defaultOptionIds: (() => {
          const mapped = mapIdList((x as any).defaultOptionIds, sharedOptionIdMap)
          return mapped.length ? JSON.stringify(mapped) : null
        })(),
        status: x.status || 'ACTIVE'
      }))
    )
  }

  if (data.sharedSpecOptions.length) {
    await em.getRepository(SharedSpecOption).insert(
      data.sharedSpecOptions.map((x) => ({
        optionId: sharedOptionIdMap.get(x.optionId)!,
        sharedSpecGroupId: sharedGroupIdMap.get(x.sharedSpecGroupId)!,
        templateId: remapTemplateId((x as any).templateId, externalMap),
        name: x.name,
        priceCents: x.priceCents || '0',
        sort: Number(x.sort || 0) || 0,
        status: x.status || 'ACTIVE'
      }))
    )
  }

  if (data.goodSharedSpecGroups.length) {
    await em.getRepository(GoodSharedSpecGroup).insert(
      data.goodSharedSpecGroups.map((x) => ({
        storeId,
        goodId: goodIdMap.get(x.goodId)!,
        sharedSpecGroupId: sharedGroupIdMap.get(x.sharedSpecGroupId)!,
        disabledOptionIds: (() => {
          const mapped = mapIdList((x as any).disabledOptionIds, sharedOptionIdMap)
          return mapped.length ? JSON.stringify(mapped) : null
        })(),
        defaultOptionIds: (() => {
          const mapped = mapIdList((x as any).defaultOptionIds, sharedOptionIdMap)
          return mapped.length ? JSON.stringify(mapped) : null
        })(),
        sort: Number(x.sort || 0) || 0
      }))
    )
  }

  const newTableIds: string[] = []
  if (data.tables.length) {
    await em.getRepository(Table).insert(
      data.tables.map((t) => {
        const newId = tableIdMap.get(t.tableId)!
        newTableIds.push(newId)
        return {
          tableId: newId,
          storeId,
          code: t.code,
          status: 'FREE',
          sessionVersion: 1,
          sessionClosedAt: null,
          qrcodeUrl: null,
          h5QrcodeUrl: null
        }
      })
    )
  }

  return {
    storeId,
    newTableIds,
    idMaps: {
      categoryIdMap,
      goodIdMap,
      skuIdMap,
      specGroupIdMap,
      specOptionIdMap,
      sharedGroupIdMap,
      sharedOptionIdMap,
      tableIdMap
    },
    counts: {
      categories: data.categories.length,
      goods: data.goods.length,
      skus: data.skus.length,
      specGroups: data.specGroups.length,
      specOptions: data.specOptions.length,
      sharedSpecGroups: data.sharedSpecGroups.length,
      sharedSpecOptions: data.sharedSpecOptions.length,
      goodSharedSpecGroups: data.goodSharedSpecGroups.length,
      tables: data.tables.length
    }
  }
}

router.get(
  '/api/v1/stores/current',
  asyncHandler(async (req, res) => {
    const repo = AppDataSource.getRepository(Store)
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const headerStoreId =
      typeof req.headers['x-store-id'] === 'string' && req.headers['x-store-id']
        ? String(req.headers['x-store-id'])
        : ''
    const queryStoreId = typeof req.query.storeId === 'string' && req.query.storeId ? String(req.query.storeId) : ''
    const storeId = headerStoreId || queryStoreId || 'store_default'
    const store = await repo.findOne({ where: { storeId } })
    if (!store || store.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }
    const tenant = store?.tenantId ? await tenantRepo.findOne({ where: { tenantId: store.tenantId } }) : null
    const tenantBrandName = tenant?.brandName || null
    const tenantType = tenant?.type || null
    ok(res, {
      storeId: store.storeId,
      tenantId: store.tenantId,
      tenantType,
      tenantBrandName,
      subName: store.subName,
      name: store.name,
      displayName: buildStoreDisplayName(tenant, store),
      logoUrl: store.logoUrl,
      phone: store.phone,
      address: store.address,
      description: store.description
    })
  })
)

router.put(
  '/api/v1/stores/current',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const repo = AppDataSource.getRepository(Store)
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeId = getActiveStoreId(req)
    const store = await repo.findOne({ where: { storeId } })
    if (!store || store.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }
    const tenant = store.tenantId ? await tenantRepo.findOne({ where: { tenantId: store.tenantId } }) : null
    const isChain = tenant?.type === 'CHAIN'
    const isSingle = tenant?.type === 'SINGLE'
    const { name, logoUrl, phone, address, description } = req.body || {}
    if (isChain && logoUrl !== undefined && String(logoUrl || '') !== String(store.logoUrl || '')) {
      res.status(403).json({
        success: false,
        code: 40300,
        message: '连锁租户门店 Logo 由品牌 Logo 同步，不能单独修改',
        data: null
      })
      return
    }
    if (name !== undefined) store.name = name
    if (!isChain && logoUrl !== undefined) store.logoUrl = logoUrl
    if (phone !== undefined) store.phone = phone
    if (address !== undefined) store.address = address
    if (description !== undefined) store.description = description

    // 单店租户：门店名就是品牌名，门店是权威方，改名时同步把 tenant.brandName 改过来。
    const shouldSyncBrand = isSingle && !!tenant && name !== undefined && tenant!.brandName !== store.name

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(Store).save(store)
      if (shouldSyncBrand && tenant) {
        tenant.brandName = store.name
        await manager.getRepository(Tenant).save(tenant)
      }
    })
    ok(res, { storeId: store.storeId }, 'Updated')
  })
)

router.get(
  '/api/v1/stores/export',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const em = AppDataSource.manager
    const includeInactive =
      req.query.includeInactive === '1' || req.query.includeInactive === 'true' || req.query.includeInactive === 'yes'
    const storeRepo = em.getRepository(Store)
    const storeId = getActiveStoreId(req)
    const store = await storeRepo.findOne({ where: { storeId } })
    if (!store || store.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }

    const categories = await em
      .getRepository(Category)
      .find({ where: { storeId: store.storeId, ...(includeInactive ? {} : { status: 'ACTIVE' }) } as any })
    const exportedCategoryIdSet = new Set(categories.map((c) => c.categoryId))
    const goods = await em.getRepository(Good).find({ where: { storeId: store.storeId } })
    const goodIds = goods.map((g) => g.goodId)
    const goodCategories = goodIds.length
      ? await em.getRepository(GoodCategory).find({ where: { storeId: store.storeId, goodId: In(goodIds) } })
      : []
    const categoryIdsByGoodId = new Map<string, string[]>()
    const categorySortByIdByGoodId = new Map<string, Record<string, number>>()
    for (const gc of goodCategories) {
      if (!exportedCategoryIdSet.has(gc.categoryId)) continue
      const arr = categoryIdsByGoodId.get(gc.goodId) || []
      arr.push(gc.categoryId)
      categoryIdsByGoodId.set(gc.goodId, arr)
      const cur = categorySortByIdByGoodId.get(gc.goodId) || {}
      cur[gc.categoryId] = Number(gc.sort || 0) || 0
      categorySortByIdByGoodId.set(gc.goodId, cur)
    }
    const specGroups = goodIds.length
      ? await em
          .getRepository(SpecGroup)
          .find({ where: { goodId: In(goodIds), ...(includeInactive ? {} : { status: 'ACTIVE' }) } as any })
      : []
    const groupIds = specGroups.map((g) => g.specGroupId)
    const specOptions = groupIds.length
      ? await em
          .getRepository(SpecOption)
          .find({ where: { specGroupId: In(groupIds), ...(includeInactive ? {} : { status: 'ACTIVE' }) } as any })
      : []
    const sharedSpecGroups = await em
      .getRepository(SharedSpecGroup)
      .find({ where: { storeId: store.storeId, ...(includeInactive ? {} : { status: 'ACTIVE' }) } as any })
    const sharedIds = sharedSpecGroups.map((g) => g.sharedSpecGroupId)
    const sharedSpecOptions = sharedIds.length
      ? await em.getRepository(SharedSpecOption).find({
          where: { sharedSpecGroupId: In(sharedIds), ...(includeInactive ? {} : { status: 'ACTIVE' }) } as any
        })
      : []
    const goodSharedSpecGroups = goodIds.length
      ? await em.getRepository(GoodSharedSpecGroup).find({ where: { goodId: In(goodIds) } })
      : []
    const skus = goodIds.length ? await em.getRepository(SKU).find({ where: { goodId: In(goodIds) } }) : []
    const tables = await em.getRepository(Table).find({ where: { storeId: store.storeId } })

    const payload: StoreExportV2 = {
      version: 2,
      exportedAt: new Date().toISOString(),
      store: {
        storeId: store.storeId,
        name: store.name,
        subName: store.subName || null,
        logoUrl: store.logoUrl || '',
        phone: store.phone || '',
        address: store.address || '',
        description: store.description || ''
      },
      categories: categories.map((c) => ({
        categoryId: c.categoryId,
        storeId: c.storeId,
        templateId: c.templateId || null,
        name: c.name,
        subtitle: c.subtitle || null,
        badgeText: c.badgeText || null,
        sort: c.sort,
        status: c.status
      })),
      goods: goods.map((g) => {
        let categoryIds = categoryIdsByGoodId.get(g.goodId)
        if (!categoryIds || !categoryIds.length) {
          categoryIds = exportedCategoryIdSet.has(g.categoryId) ? [g.categoryId] : []
        }
        if (!categoryIds.length && exportedCategoryIdSet.size) {
          categoryIds = [Array.from(exportedCategoryIdSet)[0]]
        }
        const categoryId = categoryIds.length ? categoryIds[0] : g.categoryId
        const categorySortById = categorySortByIdByGoodId.get(g.goodId) || {}
        const filteredCategorySortById: Record<string, number> = {}
        for (const cid of categoryIds) {
          if (Object.prototype.hasOwnProperty.call(categorySortById, cid))
            filteredCategorySortById[cid] = categorySortById[cid]
        }
        return {
          goodId: g.goodId,
          storeId: g.storeId,
          templateId: g.templateId || null,
          categoryId,
          categoryIds,
          categorySortById: filteredCategorySortById,
          defaultSkuId: g.defaultSkuId || null,
          name: g.name,
          description: g.description || '',
          detailMarkdown: g.detailMarkdown || null,
          imageUrls: g.imageUrls || null,
          sales: 0,
          basePrice: g.basePrice || '0',
          status: g.status
        }
      }),
      skus: skus.map((s) => ({
        skuId: s.skuId,
        goodId: s.goodId,
        specCombination: s.specCombination,
        specKey: s.specKey,
        specSignature: s.specSignature,
        price: s.price || '0',
        stock: s.stock || 0,
        status: s.status
      })),
      specGroups: specGroups.map((x) => ({
        specGroupId: x.specGroupId,
        templateId: x.templateId || null,
        goodId: x.goodId,
        name: x.name,
        isRequired: x.isRequired,
        minSelection: x.minSelection,
        maxSelection: x.maxSelection,
        sort: x.sort,
        isStock: Boolean((x as any).isStock),
        defaultOptionIds: (() => {
          try {
            const parsed = (x as any).defaultOptionIds ? JSON.parse(String((x as any).defaultOptionIds)) : []
            return Array.isArray(parsed) ? parsed.map((v) => String(v || '')).filter((v) => v) : []
          } catch {
            return []
          }
        })(),
        status: x.status
      })),
      specOptions: specOptions.map((x) => ({
        optionId: x.optionId,
        templateId: x.templateId || null,
        specGroupId: x.specGroupId,
        name: x.name,
        priceCents: x.priceCents || '0',
        sort: x.sort,
        status: x.status
      })),
      sharedSpecGroups: sharedSpecGroups.map((x) => ({
        sharedSpecGroupId: x.sharedSpecGroupId,
        storeId: x.storeId,
        templateId: x.templateId || null,
        name: x.name,
        description: x.description || null,
        isRequired: x.isRequired,
        minSelection: x.minSelection,
        maxSelection: x.maxSelection,
        sort: x.sort,
        defaultOptionIds: (() => {
          try {
            const parsed = x.defaultOptionIds ? JSON.parse(String(x.defaultOptionIds)) : []
            return Array.isArray(parsed) ? parsed.map((v) => String(v || '')).filter((v) => v) : []
          } catch {
            return []
          }
        })(),
        status: x.status
      })),
      sharedSpecOptions: sharedSpecOptions.map((x) => ({
        optionId: x.optionId,
        sharedSpecGroupId: x.sharedSpecGroupId,
        templateId: x.templateId || null,
        name: x.name,
        priceCents: x.priceCents || '0',
        sort: x.sort,
        status: x.status
      })),
      goodSharedSpecGroups: goodSharedSpecGroups.map((x) => ({
        storeId: x.storeId,
        goodId: x.goodId,
        sharedSpecGroupId: x.sharedSpecGroupId,
        disabledOptionIds: (() => {
          try {
            const parsed = x.disabledOptionIds ? JSON.parse(String(x.disabledOptionIds)) : []
            return Array.isArray(parsed) ? parsed.map((v) => String(v || '')).filter((v) => v) : []
          } catch {
            return []
          }
        })(),
        defaultOptionIds: (() => {
          try {
            const parsed = x.defaultOptionIds ? JSON.parse(String(x.defaultOptionIds)) : []
            return Array.isArray(parsed) ? parsed.map((v) => String(v || '')).filter((v) => v) : []
          } catch {
            return []
          }
        })(),
        sort: x.sort
      })),
      tables: tables.map((t) => ({
        tableId: t.tableId,
        storeId: t.storeId,
        code: t.code,
        qrcodeUrl: t.qrcodeUrl || null,
        h5QrcodeUrl: t.h5QrcodeUrl || null
      }))
    }

    const body = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    const key = `exports/store/${ymd()}/store_export_${Date.now()}_${crypto.randomUUID()}.json`
    try {
      await cosPutObject({ key, body, contentType: 'application/json', cacheControl: 'public, max-age=60' })
      ok(res, { key, publicUrl: buildPublicUrl(key), size: body.length }, 'Exported')
    } catch (e: unknown) {
      const err = e as Record<string, unknown>
      const statusCode = typeof err?.statusCode === 'number' ? (err.statusCode as number) : 500
      const message =
        statusCode === 403
          ? 'COS access denied'
          : statusCode === 404
            ? 'COS bucket or region not found'
            : statusCode === 503
              ? 'COS service unavailable'
              : 'Failed to export'
      res
        .status(statusCode >= 400 && statusCode < 600 ? statusCode : 500)
        .json({ success: false, code: 50000, message, data: null })
    }
  })
)

router.post(
  '/api/v1/stores/import',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  (req, res, next) => {
    const handler = jsonUpload.single('file') as unknown as (
      req: Request,
      res: Response,
      next: (err?: unknown) => void
    ) => void
    handler(req, res, (err) => {
      if (!err) return next()
      const code = typeof err === 'object' && err ? (err as Record<string, unknown>).code : undefined
      if (code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ success: false, code: 41301, message: 'File too large', data: null })
        return
      }
      res.status(400).json({ success: false, code: 40000, message: 'Invalid upload request', data: null })
    })
  },
  asyncHandler(async (req, res) => {
    const file = req.file
    if (!file?.buffer) {
      res.status(400).json({ success: false, code: 40000, message: 'No file uploaded', data: null })
      return
    }

    let json: unknown = null
    try {
      json = JSON.parse(String(file.buffer))
    } catch {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid JSON', data: null })
      return
    }

    let data: StoreExportV2
    try {
      data = parseStoreExport(json)
    } catch (e) {
      res.status(400).json({
        success: false,
        code: 40000,
        message: e instanceof Error ? e.message : 'Invalid JSON schema',
        data: null
      })
      return
    }

    const storeId = getActiveStoreId(req)
    await setStoreMaintenanceState(storeId, true, '门店恢复中，请稍后重试')
    try {
      const result = await AppDataSource.manager.transaction(async (em) => {
        return await applyStoreConfigClone(em, storeId, data)
      })
      if (result.newTableIds.length) {
        const tableRepo = AppDataSource.getRepository(Table)
        const canMiniProgram = Boolean(config.wechatMiniProgram.appId && config.wechatMiniProgram.secret)
        const canH5 = Boolean(config.h5AppDomain && config.cos.bucket && config.cos.region)
        for (const tableId of result.newTableIds) {
          if (canMiniProgram) {
            try {
              const { publicUrl } = await generateTableMiniProgramQrcode({ tableId })
              await tableRepo.update({ tableId }, { qrcodeUrl: publicUrl })
            } catch {}
            await new Promise((r) => setTimeout(r, 1000))
          }
          if (canH5) {
            try {
              const { publicUrl } = await generateTableH5Qrcode({ tableId })
              await tableRepo.update({ tableId }, { h5QrcodeUrl: publicUrl })
            } catch {}
          }
        }
      }
      try {
        const storeRepo = AppDataSource.getRepository(Store)
        const store = await storeRepo.findOne({ where: { storeId } })
        const tenantId = store?.tenantId || null
        const repo = AppDataSource.getRepository(Notification)
        await repo.save(
          repo.create({
            notificationId: genId('ntf'),
            type: 'STORE_DATA_MOVE_FINISHED',
            title: '恢复完成',
            message: '门店数据恢复完成',
            tenantId,
            storeId,
            status: 'UNREAD',
            readAt: null,
            handledAt: null,
            payload: { storeId }
          })
        )
      } catch {}
      ok(res, { storeId: result.storeId, counts: result.counts }, 'Imported')
    } finally {
      await setStoreMaintenanceState(storeId, false)
    }
  })
)

router.post(
  '/api/v1/stores/reset',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const storeRepo = AppDataSource.getRepository(Store)
    const storeId = getActiveStoreId(req)
    const store = await storeRepo.findOne({ where: { storeId } })
    if (!store || store.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }
    const data: StoreExportV2 = {
      version: 2,
      exportedAt: new Date().toISOString(),
      store: { storeId: store.storeId, name: 'BiteGo 门店', logoUrl: '', phone: '', address: '', description: '' },
      categories: [],
      goods: [],
      skus: [],
      specGroups: [],
      specOptions: [],
      sharedSpecGroups: [],
      sharedSpecOptions: [],
      goodSharedSpecGroups: [],
      tables: []
    }
    await setStoreMaintenanceState(storeId, true, '门店清空中，请稍后重试')
    try {
      const result = await AppDataSource.manager.transaction(async (em) => {
        return await applyStoreConfigClone(em, storeId, data)
      })
      try {
        const storeRepo = AppDataSource.getRepository(Store)
        const store = await storeRepo.findOne({ where: { storeId } })
        const tenantId = store?.tenantId || null
        const repo = AppDataSource.getRepository(Notification)
        await repo.save(
          repo.create({
            notificationId: genId('ntf'),
            type: 'STORE_DATA_MOVE_FINISHED',
            title: '清空完成',
            message: '门店数据已清空',
            tenantId,
            storeId,
            status: 'UNREAD',
            readAt: null,
            handledAt: null,
            payload: { storeId }
          })
        )
      } catch {}
      ok(res, { storeId: result.storeId, counts: result.counts }, 'Reset')
    } finally {
      await setStoreMaintenanceState(storeId, false)
    }
  })
)

export { parseStoreExport, applyStoreConfigClone }

export default router
