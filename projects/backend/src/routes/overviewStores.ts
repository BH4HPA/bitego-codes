import { Router } from 'express'
import { AppDataSource } from '../db'
import { Store } from '../entities/Store'
import { Table } from '../entities/Table'
import { Tenant } from '../entities/Tenant'
import { getTableConnCount } from '../ws/tableSession'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { getAdminContext, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { In } from 'typeorm'
import { buildStoreDisplayName } from '../utils/storeName'

const router = Router()

function getStoreType(tenantType: string | null, isPrimary: number) {
  if (tenantType === 'SINGLE') return 'SINGLE_STORE'
  if (tenantType === 'CHAIN') return isPrimary === 1 ? 'CHAIN_PRIMARY' : 'CHAIN_BRANCH'
  return null
}

async function ensureTenantExists(tenantId: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(Tenant)
  const row = await repo.findOne({ where: { tenantId } })
  return Boolean(row && !row.deletedAt)
}

type TableAggRow = { storeId: string; totalTableCount: number; occupiedTableCount: number }

async function getTableAggByStoreIds(storeIds: string[]): Promise<Map<string, TableAggRow>> {
  if (!storeIds.length) return new Map()
  const repo = AppDataSource.getRepository(Table)
  const rows = await repo
    .createQueryBuilder('t')
    .select('t.storeId', 'storeId')
    .addSelect('COUNT(1)', 'totalTableCount')
    .addSelect("SUM(CASE WHEN t.status = 'OCCUPIED' THEN 1 ELSE 0 END)", 'occupiedTableCount')
    .where('t.deletedAt IS NULL')
    .andWhere('t.storeId IN (:...storeIds)', { storeIds })
    .groupBy('t.storeId')
    .getRawMany()
  const out = new Map<string, TableAggRow>()
  for (const r of rows as any[]) {
    const storeId = String(r.storeId)
    out.set(storeId, {
      storeId,
      totalTableCount: parseInt(String(r.totalTableCount || '0'), 10) || 0,
      occupiedTableCount: parseInt(String(r.occupiedTableCount || '0'), 10) || 0
    })
  }
  return out
}

async function getOnlineConnCountByStoreIds(storeIds: string[]): Promise<Map<string, number>> {
  if (!storeIds.length) return new Map()
  const repo = AppDataSource.getRepository(Table)
  const rows = await repo
    .createQueryBuilder('t')
    .select('t.storeId', 'storeId')
    .addSelect('t.tableId', 'tableId')
    .where('t.deletedAt IS NULL')
    .andWhere('t.storeId IN (:...storeIds)', { storeIds })
    .getRawMany()
  const out = new Map<string, number>()
  for (const r of rows as any[]) {
    const storeId = String(r.storeId)
    const tableId = String(r.tableId)
    const n = getTableConnCount(tableId)
    out.set(storeId, (out.get(storeId) || 0) + n)
  }
  return out
}

router.get(
  '/api/v1/platform/overview/stores',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId.trim() : ''
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    const storeRepo = AppDataSource.getRepository(Store)
    const qb = storeRepo.createQueryBuilder('s').where('s.deletedAt IS NULL')
    if (tenantId) qb.andWhere('s.tenantId = :tenantId', { tenantId })
    if (keyword) qb.andWhere('(s.storeId LIKE :kw OR s.name LIKE :kw OR s.subName LIKE :kw)', { kw: `%${keyword}%` })

    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [stores, total] = await qb.getManyAndCount()
    const storeIds = stores.map((s) => s.storeId)
    const aggByStoreId = await getTableAggByStoreIds(storeIds)
    const onlineByStoreId = await getOnlineConnCountByStoreIds(storeIds)

    const tenantIds = Array.from(new Set(stores.map((s) => s.tenantId).filter(Boolean)))
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenants = tenantIds.length ? await tenantRepo.findBy({ tenantId: In(tenantIds) }) : []
    const tenantById = new Map<string, Tenant>()
    for (const t of tenants) if (!t.deletedAt) tenantById.set(t.tenantId, t)

    ok(res, {
      list: stores.flatMap((s) => {
        const agg = aggByStoreId.get(s.storeId) || { storeId: s.storeId, totalTableCount: 0, occupiedTableCount: 0 }
        const tenant = s.tenantId ? tenantById.get(s.tenantId) : undefined
        if (tenant?.type === 'SINGLE' && tenant.primaryStoreId && tenant.primaryStoreId !== s.storeId) {
          if (s.storeId === tenant.tenantId) return []
        }
        return {
          storeId: s.storeId,
          tenantId: s.tenantId || '',
          tenantType: tenant?.type || null,
          tenantBrandName: tenant?.brandName || '',
          tenantBrandLogoUrl: tenant?.brandLogoUrl || null,
          storeType: getStoreType(tenant?.type || null, s.isPrimary),
          isPrimary: s.isPrimary,
          subName: s.subName,
          name: s.name,
          displayName: buildStoreDisplayName(tenant, s),
          logoUrl: s.logoUrl,
          totalTableCount: agg.totalTableCount,
          occupiedTableCount: agg.occupiedTableCount,
          onlineUserCount: onlineByStoreId.get(s.storeId) || 0,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        }
      }),
      pagination: { page, pageSize, total }
    })
  })
)

router.get(
  '/api/v1/tenant/overview/stores',
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

    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    const storeRepo = AppDataSource.getRepository(Store)
    const qb = storeRepo.createQueryBuilder('s').where('s.deletedAt IS NULL').andWhere('s.tenantId = :tenantId', {
      tenantId
    })
    if (keyword) qb.andWhere('(s.storeId LIKE :kw OR s.name LIKE :kw OR s.subName LIKE :kw)', { kw: `%${keyword}%` })

    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [stores, total] = await qb.getManyAndCount()
    const storeIds = stores.map((s) => s.storeId)
    const aggByStoreId = await getTableAggByStoreIds(storeIds)
    const onlineByStoreId = await getOnlineConnCountByStoreIds(storeIds)

    ok(res, {
      list: stores.map((s) => {
        const agg = aggByStoreId.get(s.storeId) || { storeId: s.storeId, totalTableCount: 0, occupiedTableCount: 0 }
        return {
          storeId: s.storeId,
          tenantId: s.tenantId || '',
          isPrimary: s.isPrimary,
          subName: s.subName,
          name: s.name,
          logoUrl: s.logoUrl,
          totalTableCount: agg.totalTableCount,
          occupiedTableCount: agg.occupiedTableCount,
          onlineUserCount: onlineByStoreId.get(s.storeId) || 0,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        }
      }),
      pagination: { page, pageSize, total }
    })
  })
)

export default router
