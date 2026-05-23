import { Router } from 'express'
import { AppDataSource } from '../db'
import { Category } from '../entities/Category'
import { GoodCategory } from '../entities/GoodCategory'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { asyncHandler } from '../http/asyncHandler'
import { created, ok } from '../http/responses'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { getAdminContext, requireAdminContext } from '../middlewares/adminAuthz'
import { isPrimaryStore, recordStoreSyncChange } from '../services/storeSyncChangeService'
import { genId } from '../utils/id'
import { In } from 'typeorm'

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

router.get(
  '/api/v1/categories',
  asyncHandler(async (req, res) => {
    const repo = AppDataSource.getRepository(Category)
    const status = typeof req.query.status === 'string' ? req.query.status : 'ACTIVE'
    const storeIdHeader =
      typeof req.headers['x-store-id'] === 'string' && req.headers['x-store-id']
        ? String(req.headers['x-store-id'])
        : ''
    const tenantIdHeader =
      typeof req.headers['x-tenant-id'] === 'string' && req.headers['x-tenant-id']
        ? String(req.headers['x-tenant-id'])
        : ''
    let storeId = typeof req.query.storeId === 'string' && req.query.storeId ? String(req.query.storeId) : ''
    if (!storeId) storeId = storeIdHeader
    if (!storeId && tenantIdHeader) {
      const tenantRepo = AppDataSource.getRepository(Tenant)
      const tenant = await tenantRepo.findOne({ where: { tenantId: tenantIdHeader } })
      if (tenant && !tenant.deletedAt && tenant.primaryStoreId) storeId = tenant.primaryStoreId
    }
    if (!storeId) storeId = 'store_default'
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20))
    const [rows, total] = await repo.findAndCount({
      where: { status, storeId },
      order: { sort: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    ok(res, {
      list: rows.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        subtitle: c.subtitle || null,
        badgeText: c.badgeText || null,
        sort: c.sort
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.post(
  '/api/v1/categories',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { name, subtitle, badgeText, sort = 0, status = 'ACTIVE' } = req.body || {}
    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid name', data: null })
      return
    }
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
    const activeStoreId = resolved.storeId
    const okPrimary = await isPrimaryStore({
      manager: AppDataSource.manager,
      tenantId: ctx.tenantId,
      storeId: activeStoreId
    })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const categoryId = genId('cat')
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Category)
      const row = repo.create({
        categoryId,
        storeId: activeStoreId,
        templateId: null,
        name,
        subtitle: subtitle ? String(subtitle) : null,
        badgeText: badgeText ? String(badgeText) : null,
        sort: Number(sort) || 0,
        status
      })
      await repo.save(row)
      if (ctx && activeStoreId) {
        const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId: activeStoreId })
        if (okPrimary) {
          await recordStoreSyncChange({
            manager,
            tenantId: ctx.tenantId,
            sourceStoreId: activeStoreId,
            entityType: 'CATEGORY',
            entityTemplateId: row.templateId || row.categoryId,
            action: 'UPSERT',
            name: row.name,
            changedByUserId: (req as any)?.user?.userId || null
          })
        }
      }
    })
    created(res, { categoryId }, 'Created')
  })
)

router.put(
  '/api/v1/categories/:categoryId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { categoryId } = req.params
    const { name, subtitle, badgeText, sort, status } = req.body || {}
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
    const activeStoreId = resolved.storeId
    const okPrimary = await isPrimaryStore({
      manager: AppDataSource.manager,
      tenantId: ctx.tenantId,
      storeId: activeStoreId
    })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Category)
      const row = await repo.findOne({ where: { categoryId, storeId: activeStoreId } })
      if (!row) {
        res.status(404).json({ success: false, code: 40400, message: 'Category not found', data: null })
        return
      }
      if (name !== undefined) row.name = name
      if (subtitle !== undefined) row.subtitle = subtitle ? String(subtitle) : null
      if (badgeText !== undefined) row.badgeText = badgeText ? String(badgeText) : null
      if (sort !== undefined) row.sort = Number(sort) || 0
      if (status !== undefined) row.status = status
      await repo.save(row)
      if (ctx && activeStoreId) {
        const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId: activeStoreId })
        if (okPrimary) {
          await recordStoreSyncChange({
            manager,
            tenantId: ctx.tenantId,
            sourceStoreId: activeStoreId,
            entityType: 'CATEGORY',
            entityTemplateId: row.templateId || row.categoryId,
            action: 'UPSERT',
            name: row.name,
            changedByUserId: (req as any)?.user?.userId || null
          })
        }
      }
    })
    if (res.headersSent) return
    ok(res, { categoryId }, 'Updated')
  })
)

router.delete(
  '/api/v1/categories/:categoryId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { categoryId } = req.params
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
    const activeStoreId = resolved.storeId
    const okPrimary = await isPrimaryStore({
      manager: AppDataSource.manager,
      tenantId: ctx.tenantId,
      storeId: activeStoreId
    })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Category)
      const row = await repo.findOne({ where: { categoryId, storeId: activeStoreId } })
      if (!row) {
        res.status(404).json({ success: false, code: 40400, message: 'Category not found', data: null })
        return
      }
      row.status = 'INACTIVE'
      await repo.save(row)
      if (ctx && activeStoreId) {
        const okPrimary = await isPrimaryStore({ manager, tenantId: ctx.tenantId, storeId: activeStoreId })
        if (okPrimary) {
          await recordStoreSyncChange({
            manager,
            tenantId: ctx.tenantId,
            sourceStoreId: activeStoreId,
            entityType: 'CATEGORY',
            entityTemplateId: row.templateId || row.categoryId,
            action: 'DELETE',
            name: row.name,
            changedByUserId: (req as any)?.user?.userId || null
          })
        }
      }
    })
    if (res.headersSent) return
    ok(res, { categoryId }, 'Deleted')
  })
)

router.put(
  '/api/v1/categories/:categoryId/goods/reorder',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { categoryId } = req.params
    const rawGoodIds = (req.body as any)?.goodIds
    if (!Array.isArray(rawGoodIds) || !rawGoodIds.length) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid goodIds', data: null })
      return
    }
    const goodIds = rawGoodIds.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((x) => x)
    if (!goodIds.length || goodIds.length !== rawGoodIds.length) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid goodIds', data: null })
      return
    }
    const repo = AppDataSource.getRepository(Category)
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
    const activeStoreId = resolved.storeId
    const okPrimary = await isPrimaryStore({
      manager: AppDataSource.manager,
      tenantId: ctx.tenantId,
      storeId: activeStoreId
    })
    if (!okPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const cat = await repo.findOne({ where: { categoryId, storeId: activeStoreId } })
    if (!cat) {
      res.status(404).json({ success: false, code: 40400, message: 'Category not found', data: null })
      return
    }
    const uniqGoodIds = Array.from(new Set(goodIds))
    const base = uniqGoodIds.length * 10
    await AppDataSource.transaction(async (manager) => {
      const mapRepo = manager.getRepository(GoodCategory)
      const existing = await mapRepo.find({ where: { storeId: activeStoreId, categoryId, goodId: In(uniqGoodIds) } })
      const byGoodId = new Map(existing.map((x) => [x.goodId, x]))
      const toSave: GoodCategory[] = []
      for (let i = 0; i < uniqGoodIds.length; i += 1) {
        const gid = uniqGoodIds[i]
        const sort = base - i * 10
        const row = byGoodId.get(gid) || mapRepo.create({ storeId: activeStoreId, categoryId, goodId: gid, sort })
        row.sort = sort
        toSave.push(row)
      }
      await mapRepo.save(toSave)
    })
    ok(res, { categoryId, goodIdsCount: uniqGoodIds.length }, 'Reordered')
  })
)

export default router
