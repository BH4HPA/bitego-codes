import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { In } from 'typeorm'
import { AppDataSource } from '../db'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { getAdminContext, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { buildPublicUrl, cosPutObject } from '../qcloud/cos'
import { Store } from '../entities/Store'
import { Category } from '../entities/Category'
import { Good } from '../entities/Good'
import { GoodCategory } from '../entities/GoodCategory'
import { SpecGroup } from '../entities/SpecGroup'
import { SpecOption } from '../entities/SpecOption'
import { SharedSpecGroup } from '../entities/SharedSpecGroup'
import { SharedSpecOption } from '../entities/SharedSpecOption'
import { GoodSharedSpecGroup } from '../entities/GoodSharedSpecGroup'
import { SKU } from '../entities/SKU'
import { Table } from '../entities/Table'
import { Notification } from '../entities/Notification'
import { setTenantMaintenanceState } from '../services/maintenance'
import { config } from '../config'
import { generateTableMiniProgramQrcode } from '../services/wechatMiniProgramQrcode'
import { generateTableH5Qrcode } from '../services/h5Qrcode'
import { genId } from '../utils/id'
import { Tenant } from '../entities/Tenant'
import { parseStoreExport, applyStoreConfigClone } from './stores'

const router = Router()

const jsonStorage = multer.memoryStorage()
const jsonUpload = multer({ storage: jsonStorage, limits: { fileSize: 50 * 1024 * 1024 } })

type TenantSnapshotV1 = { version: 1; exportedAt: string; tenantId: string; stores: unknown[] }

function ymd() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function buildEmptyStoreExport(storeId: string) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    store: { storeId, name: 'BiteGo 门店', subName: null, logoUrl: '', phone: '', address: '', description: '' },
    categories: [],
    goods: [],
    skus: [],
    specGroups: [],
    specOptions: [],
    sharedSpecGroups: [],
    sharedSpecOptions: [],
    goodSharedSpecGroups: [],
    tables: []
  } as const
}

async function buildStoreExport(params: { storeId: string; includeInactive: boolean }) {
  const em = AppDataSource.manager
  const storeRepo = em.getRepository(Store)
  const store = await storeRepo.findOne({ where: { storeId: params.storeId } })
  if (!store) throw new Error('Store not found')

  const categories = await em
    .getRepository(Category)
    .find({ where: { storeId: store.storeId, ...(params.includeInactive ? {} : { status: 'ACTIVE' }) } as any })
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
        .find({ where: { goodId: In(goodIds), ...(params.includeInactive ? {} : { status: 'ACTIVE' }) } as any })
    : []
  const groupIds = specGroups.map((g) => g.specGroupId)
  const specOptions = groupIds.length
    ? await em
        .getRepository(SpecOption)
        .find({ where: { specGroupId: In(groupIds), ...(params.includeInactive ? {} : { status: 'ACTIVE' }) } as any })
    : []
  const sharedSpecGroups = await em
    .getRepository(SharedSpecGroup)
    .find({ where: { storeId: store.storeId, ...(params.includeInactive ? {} : { status: 'ACTIVE' }) } as any })
  const sharedIds = sharedSpecGroups.map((g) => g.sharedSpecGroupId)
  const sharedSpecOptions = sharedIds.length
    ? await em.getRepository(SharedSpecOption).find({
        where: { sharedSpecGroupId: In(sharedIds), ...(params.includeInactive ? {} : { status: 'ACTIVE' }) } as any
      })
    : []
  const goodSharedSpecGroups = goodIds.length
    ? await em.getRepository(GoodSharedSpecGroup).find({ where: { goodId: In(goodIds) } })
    : []
  const skus = goodIds.length ? await em.getRepository(SKU).find({ where: { goodId: In(goodIds) } }) : []
  const tables = await em.getRepository(Table).find({ where: { storeId: store.storeId } })

  return {
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
}

router.get(
  '/api/v1/tenant/snapshot/export',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const includeInactive =
      req.query.includeInactive === '1' || req.query.includeInactive === 'true' || req.query.includeInactive === 'yes'
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(500).json({ success: false, code: 50000, message: 'Missing admin context', data: null })
      return
    }
    if (!ctx.tenantId) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing tenantId', data: null })
      return
    }
    const storeRepo = AppDataSource.getRepository(Store)
    const stores = await storeRepo.find({ where: { tenantId: ctx.tenantId } as any })
    const exports = []
    for (const s of stores) exports.push(await buildStoreExport({ storeId: s.storeId, includeInactive }))
    const snapshot: TenantSnapshotV1 = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      stores: exports
    }
    const body = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    const key = `exports/tenant/${ymd()}/tenant_export_${Date.now()}_${crypto.randomUUID()}.json`
    await cosPutObject({ key, body, contentType: 'application/json', cacheControl: 'public, max-age=60' })
    ok(res, { key, publicUrl: buildPublicUrl(key), size: body.length }, 'Exported')
  })
)

router.post(
  '/api/v1/tenant/snapshot/import',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  (req, res, next) => {
    const handler = jsonUpload.single('file') as unknown as (req: any, res: any, next: (err?: unknown) => void) => void
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
    const ctx = getAdminContext(req)
    if (!ctx) throw new Error('Missing admin context')
    if (!ctx.tenantId) throw new Error('Missing tenantId')
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, code: 40000, message: 'No file uploaded', data: null })
      return
    }
    let json: unknown = null
    try {
      json = JSON.parse(String(req.file.buffer))
    } catch {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid JSON', data: null })
      return
    }
    const snap = json as any
    if (!snap || Number(snap.version) !== 1 || !Array.isArray(snap.stores)) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid snapshot', data: null })
      return
    }
    const storeRepo = AppDataSource.getRepository(Store)
    const stores = await storeRepo.find({ where: { tenantId: ctx.tenantId } as any })
    const storeIdSet = new Set(stores.map((s) => s.storeId))
    const parsed: Array<ReturnType<typeof parseStoreExport>> = []
    for (const raw of snap.stores) parsed.push(parseStoreExport(raw))
    const incomingIds = new Set(parsed.map((p) => p.store.storeId))
    for (const id of storeIdSet) {
      if (!incomingIds.has(id)) {
        res.status(400).json({ success: false, code: 40000, message: 'Snapshot stores mismatch', data: null })
        return
      }
    }

    const tenantRepoForImport = AppDataSource.getRepository(Tenant)
    const importingTenant = await tenantRepoForImport.findOne({ where: { tenantId: ctx.tenantId } as any })
    const primaryStoreId = importingTenant?.primaryStoreId || null

    await setTenantMaintenanceState(ctx.tenantId, true, '租户恢复中，请稍后重试')
    try {
      const results = await AppDataSource.manager.transaction(async (em) => {
        const out: Array<{ storeId: string; counts: any; newTableIds: string[] }> = []
        // Primary store first: its id maps become the externalTemplateIdMap for branches so
        // chain-sync linkages (templateId) remain valid after re-import.
        const primary = parsed.find((p) => primaryStoreId && p.store.storeId === primaryStoreId) || null
        const branches = parsed.filter((p) => p !== primary)
        let externalTemplateIdMap: Map<string, string> | undefined
        if (primary) {
          const applied = await applyStoreConfigClone(em, primary.store.storeId, primary)
          out.push(applied)
          externalTemplateIdMap = new Map<string, string>()
          for (const [oldId, newId] of applied.idMaps.categoryIdMap) externalTemplateIdMap.set(oldId, newId)
          for (const [oldId, newId] of applied.idMaps.goodIdMap) externalTemplateIdMap.set(oldId, newId)
          for (const [oldId, newId] of applied.idMaps.specGroupIdMap) externalTemplateIdMap.set(oldId, newId)
          for (const [oldId, newId] of applied.idMaps.specOptionIdMap) externalTemplateIdMap.set(oldId, newId)
          for (const [oldId, newId] of applied.idMaps.sharedGroupIdMap) externalTemplateIdMap.set(oldId, newId)
          for (const [oldId, newId] of applied.idMaps.sharedOptionIdMap) externalTemplateIdMap.set(oldId, newId)
        }
        for (const p of branches) {
          if (!storeIdSet.has(p.store.storeId)) continue
          out.push(await applyStoreConfigClone(em, p.store.storeId, p, { externalTemplateIdMap }))
        }
        return out
      })
      const allTableIds = results.flatMap((r) => r.newTableIds)
      if (allTableIds.length) {
        const tableRepo = AppDataSource.getRepository(Table)
        const canMiniProgram = Boolean(config.wechatMiniProgram.appId && config.wechatMiniProgram.secret)
        const canH5 = Boolean(config.h5AppDomain && config.cos.bucket && config.cos.region)
        for (const tableId of allTableIds) {
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
        const repo = AppDataSource.getRepository(Notification)
        await repo.save(
          repo.create({
            notificationId: genId('ntf'),
            type: 'TENANT_DATA_MOVE_FINISHED',
            title: '恢复完成',
            message: '租户数据恢复完成',
            tenantId: ctx.tenantId,
            storeId: null,
            status: 'UNREAD',
            readAt: null,
            handledAt: null,
            payload: { tenantId: ctx.tenantId }
          })
        )
      } catch {}
      ok(
        res,
        {
          tenantId: ctx.tenantId,
          stores: results.map((r) => ({ storeId: r.storeId, counts: r.counts }))
        },
        'Imported'
      )
    } finally {
      await setTenantMaintenanceState(ctx.tenantId, false)
    }
  })
)

router.post(
  '/api/v1/tenant/snapshot/import-from-store',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  (req, res, next) => {
    const handler = jsonUpload.single('file') as unknown as (req: any, res: any, next: (err?: unknown) => void) => void
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
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(500).json({ success: false, code: 50000, message: 'Missing admin context', data: null })
      return
    }
    if (!ctx.tenantId) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing tenantId', data: null })
      return
    }
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, code: 40000, message: 'No file uploaded', data: null })
      return
    }
    let json: unknown = null
    try {
      json = JSON.parse(String(req.file.buffer))
    } catch {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid JSON', data: null })
      return
    }
    const parsedStoreExport = parseStoreExport(json)

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenant = await tenantRepo.findOne({ where: { tenantId: ctx.tenantId } as any })
    if (!tenant || tenant.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    if (tenant.type !== 'CHAIN') {
      res.status(400).json({ success: false, code: 40000, message: 'Tenant is not CHAIN', data: null })
      return
    }

    await setTenantMaintenanceState(ctx.tenantId, true, '租户恢复中，请稍后重试')
    try {
      const result = await AppDataSource.manager.transaction(async (em) => {
        const storeRepo = em.getRepository(Store)
        const stores = await storeRepo.find({ where: { tenantId: ctx.tenantId } as any })
        for (const s of stores) {
          const empty = buildEmptyStoreExport(s.storeId)
          await applyStoreConfigClone(em, s.storeId, empty as any)
        }
        if (stores.length) {
          await storeRepo.softDelete({ tenantId: ctx.tenantId } as any)
        }

        const newPrimaryStoreId = genId('store')
        await storeRepo.save(
          storeRepo.create({
            storeId: newPrimaryStoreId,
            tenantId: ctx.tenantId,
            isPrimary: 1,
            subName: null,
            name: parsedStoreExport.store.name,
            logoUrl: parsedStoreExport.store.logoUrl || '',
            phone: parsedStoreExport.store.phone || '',
            address: parsedStoreExport.store.address || '',
            description: parsedStoreExport.store.description || ''
          })
        )
        await em
          .getRepository(Tenant)
          .update({ tenantId: ctx.tenantId } as any, { primaryStoreId: newPrimaryStoreId } as any)

        const applied = await applyStoreConfigClone(em, newPrimaryStoreId, parsedStoreExport)
        return { newPrimaryStoreId, counts: applied.counts, newTableIds: applied.newTableIds }
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
        const repo = AppDataSource.getRepository(Notification)
        await repo.save(
          repo.create({
            notificationId: genId('ntf'),
            type: 'TENANT_DATA_MOVE_FINISHED',
            title: '恢复完成',
            message: '租户数据恢复完成（从独立门店导入）',
            tenantId: ctx.tenantId,
            storeId: null,
            status: 'UNREAD',
            readAt: null,
            handledAt: null,
            payload: { tenantId: ctx.tenantId, mode: 'FROM_SINGLE_STORE', newPrimaryStoreId: result.newPrimaryStoreId }
          })
        )
      } catch {}

      ok(
        res,
        { tenantId: ctx.tenantId, newPrimaryStoreId: result.newPrimaryStoreId, counts: result.counts },
        'Imported'
      )
    } finally {
      await setTenantMaintenanceState(ctx.tenantId, false)
    }
  })
)

router.post(
  '/api/v1/tenant/snapshot/reset',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(500).json({ success: false, code: 50000, message: 'Missing admin context', data: null })
      return
    }
    if (!ctx.tenantId) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing tenantId', data: null })
      return
    }
    const storeRepo = AppDataSource.getRepository(Store)
    const stores = await storeRepo.find({ where: { tenantId: ctx.tenantId } as any })
    const seedStoreId =
      stores.find((s) => Number(s.isPrimary || 0) === 1)?.storeId || stores[0]?.storeId || ctx.tenantId
    const empty = parseStoreExport({
      version: 2,
      exportedAt: new Date().toISOString(),
      store: {
        storeId: seedStoreId,
        name: 'BiteGo 门店',
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      },
      categories: [],
      goods: [],
      skus: [],
      specGroups: [],
      specOptions: [],
      sharedSpecGroups: [],
      sharedSpecOptions: [],
      goodSharedSpecGroups: [],
      tables: []
    })
    await setTenantMaintenanceState(ctx.tenantId, true, '租户清空中，请稍后重试')
    try {
      const results = await AppDataSource.manager.transaction(async (em) => {
        const out: Array<{ storeId: string; counts: any; newTableIds: string[] }> = []
        for (const s of stores)
          out.push(
            await applyStoreConfigClone(em, s.storeId, { ...empty, store: { ...empty.store, storeId: s.storeId } })
          )
        return out
      })
      try {
        const repo = AppDataSource.getRepository(Notification)
        await repo.save(
          repo.create({
            notificationId: genId('ntf'),
            type: 'TENANT_DATA_MOVE_FINISHED',
            title: '清空完成',
            message: '租户数据已清空',
            tenantId: ctx.tenantId,
            storeId: null,
            status: 'UNREAD',
            readAt: null,
            handledAt: null,
            payload: { tenantId: ctx.tenantId }
          })
        )
      } catch {}
      ok(
        res,
        { tenantId: ctx.tenantId, stores: results.map((r) => ({ storeId: r.storeId, counts: r.counts })) },
        'Reset'
      )
    } finally {
      await setTenantMaintenanceState(ctx.tenantId, false)
    }
  })
)

export default router
