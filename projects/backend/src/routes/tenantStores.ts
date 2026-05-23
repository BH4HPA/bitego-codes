import { Router } from 'express'
import { AppDataSource } from '../db'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { getAdminContext, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'
import { buildStoreDisplayName } from '../utils/storeName'

const router = Router()

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

async function ensureTenantExists(tenantId: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(Tenant)
  const row = await repo.findOne({ where: { tenantId } })
  return Boolean(row && !row.deletedAt)
}

router.get(
  '/api/v1/tenant/stores',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)!
    const tenantId = ctx.tenantId
    const okTenant = await ensureTenantExists(tenantId)
    if (!okTenant) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''

    const repo = AppDataSource.getRepository(Store)
    const qb = repo
      .createQueryBuilder('s')
      .where('s.deletedAt IS NULL')
      .andWhere('s.tenantId = :tenantId', { tenantId })
    if (keyword) qb.andWhere('(s.storeId LIKE :kw OR s.name LIKE :kw OR s.subName LIKE :kw)', { kw: `%${keyword}%` })
    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [rows, total] = await qb.getManyAndCount()
    const tenantRow = await AppDataSource.getRepository(Tenant).findOne({ where: { tenantId } })
    ok(res, {
      list: rows.map((s) => ({
        storeId: s.storeId,
        tenantId: s.tenantId,
        tenantType: tenantRow?.type || null,
        tenantBrandName: tenantRow?.brandName || null,
        isPrimary: s.isPrimary,
        subName: s.subName,
        name: s.name,
        displayName: buildStoreDisplayName(tenantRow, s),
        logoUrl: s.logoUrl,
        phone: s.phone,
        address: s.address,
        description: s.description,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.get(
  '/api/v1/tenant/stores/:storeId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)!
    const tenantId = ctx.tenantId
    const okTenant = await ensureTenantExists(tenantId)
    if (!okTenant) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    const storeId = String(req.params.storeId || '').trim()
    if (!storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Store)
    const row = await repo.findOne({ where: { storeId, tenantId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }

    const tenantRow = await AppDataSource.getRepository(Tenant).findOne({ where: { tenantId } })
    ok(res, {
      storeId: row.storeId,
      tenantId: row.tenantId,
      tenantType: tenantRow?.type || null,
      tenantBrandName: tenantRow?.brandName || null,
      isPrimary: row.isPrimary,
      subName: row.subName,
      name: row.name,
      displayName: buildStoreDisplayName(tenantRow, row),
      logoUrl: row.logoUrl,
      phone: row.phone,
      address: row.address,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  })
)

router.post(
  '/api/v1/tenant/stores',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)!
    const tenantId = ctx.tenantId
    const okTenant = await ensureTenantExists(tenantId)
    if (!okTenant) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    const name = normalizeString(req.body?.name)
    const storeIdInput = normalizeString(req.body?.storeId)
    const storeId = storeIdInput || genId('store')
    if (!name) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid name', data: null })
      return
    }

    const isPrimaryRaw = req.body?.isPrimary
    const isPrimary = isPrimaryRaw === 1 || isPrimaryRaw === '1' || isPrimaryRaw === true ? 1 : 0
    if (isPrimary) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid isPrimary', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Store)
    const existed = await repo.findOne({ where: { storeId } })
    if (existed && !existed.deletedAt) {
      res.status(400).json({ success: false, code: 40000, message: 'Store already exists', data: null })
      return
    }

    const subName = normalizeString(req.body?.subName)
    const bodyLogoUrl = typeof req.body?.logoUrl === 'string' ? req.body.logoUrl : ''
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : ''
    const address = typeof req.body?.address === 'string' ? req.body.address : ''
    const description = typeof req.body?.description === 'string' ? req.body.description : ''

    const tenantRow = await AppDataSource.getRepository(Tenant).findOne({ where: { tenantId } })
    const isChain = tenantRow?.type === 'CHAIN'
    // Chain stores: logo is always the brand logo, not editable per store.
    const logoUrl = isChain ? tenantRow?.brandLogoUrl || '' : bodyLogoUrl

    await AppDataSource.transaction(async (manager) => {
      const storeRepoTx = manager.getRepository(Store)

      const row = storeRepoTx.create({
        storeId,
        tenantId,
        isPrimary: 0,
        subName: subName || null,
        name,
        logoUrl,
        phone,
        address,
        description
      })
      await storeRepoTx.save(row)
    })
    ok(res, { storeId }, 'Created')
  })
)

router.delete(
  '/api/v1/tenant/stores/:storeId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)!
    const tenantId = ctx.tenantId
    const okTenant = await ensureTenantExists(tenantId)
    if (!okTenant) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    const storeId = String(req.params.storeId || '').trim()
    if (!storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Store)
    const row = await repo.findOne({ where: { storeId, tenantId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }
    if (row.isPrimary) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    await repo.softDelete({ storeId })
    ok(res, { storeId }, 'Deleted')
  })
)

export default router
