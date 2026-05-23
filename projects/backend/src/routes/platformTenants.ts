import { Router } from 'express'
import { In } from 'typeorm'
import { AppDataSource } from '../db'
import { AdminScope } from '../entities/AdminScope'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'

const router = Router()

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function normalizeOptionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s ? s : null
}

type TenantType = 'SINGLE' | 'CHAIN'

function parseTenantType(v: unknown): TenantType | null {
  if (v === 'SINGLE' || v === 'CHAIN') return v
  return null
}

type TenantStatus = 'ACTIVE' | 'DISABLED'

function parseTenantStatus(v: unknown): TenantStatus | null {
  if (v === 'ACTIVE' || v === 'DISABLED') return v
  return null
}

router.get(
  '/api/v1/platform/tenants',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    const repo = AppDataSource.getRepository(Tenant)
    const qb = repo.createQueryBuilder('t').where('t.deletedAt IS NULL')
    if (type) qb.andWhere('t.type = :type', { type })
    if (status) qb.andWhere('t.status = :status', { status })
    if (keyword) qb.andWhere('(t.tenantId LIKE :kw OR t.brandName LIKE :kw)', { kw: `%${keyword}%` })

    qb.orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [rows, total] = await qb.getManyAndCount()
    const primaryStoreIds = Array.from(
      new Set(rows.map((t) => t.primaryStoreId).filter((x): x is string => typeof x === 'string' && Boolean(x.trim())))
    )
    const storeRepo = AppDataSource.getRepository(Store)
    const primaryStores = primaryStoreIds.length ? await storeRepo.findBy({ storeId: In(primaryStoreIds) }) : []
    const primaryStoreById = new Map<string, Store>()
    for (const s of primaryStores) if (!s.deletedAt) primaryStoreById.set(s.storeId, s)
    ok(res, {
      list: rows.map((t) => ({
        tenantId: t.tenantId,
        type: t.type,
        brandName: t.brandName,
        brandLogoUrl: t.brandLogoUrl,
        primaryStoreId: t.primaryStoreId,
        primaryStoreName: t.primaryStoreId ? primaryStoreById.get(t.primaryStoreId)?.name || null : null,
        status: t.status,
        lastSyncedChangeId: t.lastSyncedChangeId,
        lastSyncedAt: t.lastSyncedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.post(
  '/api/v1/platform/tenants',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const tenantIdInput = normalizeOptionalString(req.body?.tenantId)
    const tenantId = tenantIdInput === undefined ? genId('t') : tenantIdInput
    const type = parseTenantType(req.body?.type)
    const brandNameInput = normalizeOptionalString(req.body?.brandName)
    const brandLogoUrl = normalizeOptionalString(req.body?.brandLogoUrl)
    const status = parseTenantStatus(req.body?.status) || 'ACTIVE'

    const primaryStoreIdInput = normalizeOptionalString(req.body?.primaryStoreId)
    if (primaryStoreIdInput !== undefined && primaryStoreIdInput !== null) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid primaryStoreId', data: null })
      return
    }

    if (!tenantId || !type) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Tenant)
    const existed = await repo.findOne({ where: { tenantId } })
    if (existed) {
      res.status(400).json({ success: false, code: 40000, message: 'Tenant already exists', data: null })
      return
    }

    const storeIdInput = normalizeOptionalString(req.body?.storeId)
    const storeId = storeIdInput === undefined ? genId('store') : storeIdInput
    const storeNameInput = normalizeOptionalString(req.body?.storeName)
    const storeName = storeNameInput || brandNameInput || null

    if (!storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid store params', data: null })
      return
    }

    const brandName = type === 'SINGLE' ? storeName : brandNameInput
    if (!brandName || (type === 'SINGLE' && !storeName)) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid store params', data: null })
      return
    }

    const storeRepo = AppDataSource.getRepository(Store)
    const storeExisted = await storeRepo.findOne({ where: { storeId } })
    if (storeExisted && !storeExisted.deletedAt) {
      res.status(400).json({ success: false, code: 40000, message: 'Store already exists', data: null })
      return
    }

    await AppDataSource.transaction(async (manager) => {
      const tenantRepo = manager.getRepository(Tenant)
      const storeRepoTx = manager.getRepository(Store)

      const tenant = tenantRepo.create({
        tenantId,
        type,
        brandName,
        brandLogoUrl: null,
        primaryStoreId: storeId,
        status
      })
      await tenantRepo.save(tenant)

      const store = storeRepoTx.create({
        storeId,
        tenantId,
        isPrimary: 1,
        subName: null,
        name: storeName || brandName,
        logoUrl: '',
        phone: '',
        address: '',
        description: ''
      })
      await storeRepoTx.save(store)
    })

    ok(res, { tenantId, primaryStoreId: storeId }, 'Created')
  })
)

router.get(
  '/api/v1/platform/tenants/:tenantId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const tenantId = String(req.params.tenantId || '').trim()
    if (!tenantId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid tenantId', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Tenant)
    const row = await repo.findOne({ where: { tenantId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    ok(res, {
      tenantId: row.tenantId,
      type: row.type,
      brandName: row.brandName,
      brandLogoUrl: row.brandLogoUrl,
      primaryStoreId: row.primaryStoreId,
      status: row.status,
      lastSyncedChangeId: row.lastSyncedChangeId,
      lastSyncedAt: row.lastSyncedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  })
)

router.put(
  '/api/v1/platform/tenants/:tenantId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const tenantId = String(req.params.tenantId || '').trim()
    if (!tenantId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid tenantId', data: null })
      return
    }
    if (tenantId === 'store_default') {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Tenant)
    const row = await repo.findOne({ where: { tenantId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    const brandName = req.body?.brandName !== undefined ? normalizeString(req.body?.brandName) : undefined
    if (brandName === null) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid brandName', data: null })
      return
    }
    const brandLogoUrl =
      req.body?.brandLogoUrl !== undefined ? normalizeOptionalString(req.body?.brandLogoUrl) : undefined
    const statusRaw = req.body?.status
    const status = statusRaw !== undefined ? parseTenantStatus(statusRaw) : undefined
    if (statusRaw !== undefined && status === null) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid status', data: null })
      return
    }

    if (req.body?.type !== undefined || req.body?.primaryStoreId !== undefined) {
      res.status(400).json({ success: false, code: 40000, message: 'Readonly fields', data: null })
      return
    }

    if (brandName !== undefined) row.brandName = brandName
    if (brandLogoUrl !== undefined) row.brandLogoUrl = brandLogoUrl
    if (status !== undefined && status !== null) row.status = status

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(Tenant).save(row)

      // 单店租户：品牌名就是门店名，同步到 primary 门店。
      if (row.type === 'SINGLE' && brandName !== undefined && row.primaryStoreId) {
        const storeRepo = manager.getRepository(Store)
        const primary = await storeRepo.findOne({ where: { storeId: row.primaryStoreId } })
        if (primary && !primary.deletedAt && primary.name !== row.brandName) {
          primary.name = row.brandName
          await storeRepo.save(primary)
        }
      }
    })

    ok(res, { tenantId }, 'Updated')
  })
)

router.delete(
  '/api/v1/platform/tenants/:tenantId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const tenantId = String(req.params.tenantId || '').trim()
    if (!tenantId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid tenantId', data: null })
      return
    }
    if (tenantId === 'store_default') {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Tenant)
    const row = await repo.findOne({ where: { tenantId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(AdminScope).softDelete({ tenantId })
      await manager.getRepository(Store).softDelete({ tenantId })
      await manager.getRepository(Tenant).softDelete({ tenantId })
    })

    ok(res, { tenantId }, 'Deleted')
  })
)

export default router
