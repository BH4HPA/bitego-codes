import { Router } from 'express'
import { AppDataSource } from '../db'
import { asyncHandler } from '../http/asyncHandler'
import { accepted, ok } from '../http/responses'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { getAdminContext, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { Store } from '../entities/Store'
import { StoreSyncJob } from '../entities/StoreSyncJob'
import { StoreSyncChange } from '../entities/StoreSyncChange'
import { Tenant } from '../entities/Tenant'
import { genId } from '../utils/id'

const router = Router()

async function resolvePrimarySource(
  ctx: { board: string; tenantId: string; storeId: string | null },
  res: import('express').Response
): Promise<Store | null> {
  const storeRepo = AppDataSource.getRepository(Store)
  if (ctx.board === 'tenant') {
    const source = await storeRepo.findOne({ where: { tenantId: ctx.tenantId, isPrimary: 1 } })
    if (!source) {
      res.status(404).json({ success: false, code: 40400, message: 'Primary store not found', data: null })
      return null
    }
    return source
  }
  if (!ctx.storeId) {
    res.status(400).json({ success: false, code: 40000, message: 'Missing store context', data: null })
    return null
  }
  const source = await storeRepo.findOne({ where: { storeId: ctx.storeId } })
  if (!source || !source.tenantId) {
    res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
    return null
  }
  if (String(source.tenantId) !== String(ctx.tenantId) || !Number(source.isPrimary)) {
    res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
    return null
  }
  return source
}

router.get(
  '/api/v1/tenant/sync-shared-catalog/status',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }

    const source = await resolvePrimarySource(ctx, res)
    if (!source) return

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenant = await tenantRepo.findOne({ where: { tenantId: ctx.tenantId } })
    if (!tenant) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    const lastSynced = tenant.lastSyncedChangeId ? BigInt(String(tenant.lastSyncedChangeId)) : 0n

    const changeRepo = AppDataSource.getRepository(StoreSyncChange)
    const baseQb = changeRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('c.sourceStoreId = :sourceStoreId', { sourceStoreId: source.storeId })
    if (lastSynced > 0n) baseQb.andWhere('c.id > :lastSynced', { lastSynced: lastSynced.toString() })
    const unsyncedTotal = await baseQb.getCount()

    const summaryRows = await changeRepo
      .createQueryBuilder('c')
      .select('c.entityType', 'entityType')
      .addSelect('COUNT(1)', 'cnt')
      .where('c.tenantId = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('c.sourceStoreId = :sourceStoreId', { sourceStoreId: source.storeId })
      .andWhere(lastSynced > 0n ? 'c.id > :lastSynced' : '1=1', { lastSynced: lastSynced.toString() })
      .groupBy('c.entityType')
      .getRawMany<{ entityType: string; cnt: string }>()
    const summary: Record<string, number> = {}
    for (const r of summaryRows) summary[r.entityType] = Number(r.cnt || '0')

    const recent = await baseQb.orderBy('c.id', 'DESC').take(10).getMany()

    const jobRepo = AppDataSource.getRepository(StoreSyncJob)
    const latest = await jobRepo.findOne({
      where: { tenantId: ctx.tenantId, sourceStoreId: source.storeId, kind: 'SHARED_CATALOG' as any },
      order: { createdAt: 'DESC' as any }
    })
    let jobSummary: any = null
    if (latest?.batchId) {
      const rows = await jobRepo
        .createQueryBuilder('j')
        .select('j.status', 'status')
        .addSelect('COUNT(1)', 'cnt')
        .where('j.batchId = :batchId', { batchId: latest.batchId })
        .groupBy('j.status')
        .getRawMany<{ status: string; cnt: string }>()
      const counts: Record<string, number> = {}
      for (const r of rows) counts[r.status] = Number(r.cnt || '0')
      jobSummary = {
        batchId: latest.batchId,
        counts,
        lastSyncedAt: tenant.lastSyncedAt ? tenant.lastSyncedAt.toISOString() : null
      }
    }

    ok(res, {
      dirty: unsyncedTotal > 0,
      summary,
      recentChanges: recent.map((c) => ({
        id: c.id,
        entityType: c.entityType,
        action: c.action,
        name: c.name,
        changedByUserId: c.changedByUserId,
        changedAt: c.createdAt ? c.createdAt.toISOString() : null
      })),
      jobSummary
    })
  })
)

router.post(
  '/api/v1/tenant/sync-shared-catalog',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('TENANT_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }

    const source = await resolvePrimarySource(ctx, res)
    if (!source) return

    const storeRepo = AppDataSource.getRepository(Store)
    const jobRepo = AppDataSource.getRepository(StoreSyncJob)
    const changeRepo = AppDataSource.getRepository(StoreSyncChange)

    const stores = await storeRepo.find({ where: { tenantId: ctx.tenantId } })
    const targets = stores.filter((s) => s.storeId !== source.storeId).map((s) => s.storeId)
    if (!targets.length) {
      accepted(res, { batchId: null, enqueued: 0 }, 'No target stores')
      return
    }

    const batchId = genId('sync')
    const raw = await changeRepo
      .createQueryBuilder('c')
      .select('MAX(c.id)', 'maxId')
      .where('c.tenantId = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('c.sourceStoreId = :sourceStoreId', { sourceStoreId: source.storeId })
      .getRawOne<{ maxId: string | null }>()
    const upToChangeId = raw?.maxId ? String(raw.maxId) : null
    const rows = targets.map((targetStoreId) =>
      jobRepo.create({
        jobId: genId('job'),
        tenantId: ctx.tenantId,
        sourceStoreId: source.storeId,
        targetStoreId,
        kind: 'SHARED_CATALOG',
        batchId,
        upToChangeId,
        status: 'PENDING',
        payload: { batchId, upToChangeId, tenantId: ctx.tenantId, sourceStoreId: source.storeId, targetStoreId },
        errorMessage: null,
        startedAt: null,
        finishedAt: null
      })
    )
    await jobRepo.save(rows)
    accepted(res, { batchId, enqueued: rows.length }, 'Enqueued')
  })
)

export default router
