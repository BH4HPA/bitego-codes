import { AppDataSource } from '../db'
import { Store } from '../entities/Store'
import { StoreSyncJob } from '../entities/StoreSyncJob'
import { StoreSyncChange } from '../entities/StoreSyncChange'
import { Tenant } from '../entities/Tenant'

export async function getTenantSyncSharedCatalogStatus(params: { tenantId: string; sourceStoreId: string }) {
  const tenantRepo = AppDataSource.getRepository(Tenant)
  const tenant = await tenantRepo.findOne({ where: { tenantId: params.tenantId } })
  if (!tenant) return null
  const lastSynced = tenant.lastSyncedChangeId ? BigInt(String(tenant.lastSyncedChangeId)) : 0n

  const changeRepo = AppDataSource.getRepository(StoreSyncChange)
  const baseQb = changeRepo
    .createQueryBuilder('c')
    .where('c.tenantId = :tenantId', { tenantId: params.tenantId })
    .andWhere('c.sourceStoreId = :sourceStoreId', { sourceStoreId: params.sourceStoreId })
  if (lastSynced > 0n) baseQb.andWhere('c.id > :lastSynced', { lastSynced: lastSynced.toString() })
  const unsyncedTotal = await baseQb.getCount()

  const summaryRows = await changeRepo
    .createQueryBuilder('c')
    .select('c.entityType', 'entityType')
    .addSelect('COUNT(1)', 'cnt')
    .where('c.tenantId = :tenantId', { tenantId: params.tenantId })
    .andWhere('c.sourceStoreId = :sourceStoreId', { sourceStoreId: params.sourceStoreId })
    .andWhere(lastSynced > 0n ? 'c.id > :lastSynced' : '1=1', { lastSynced: lastSynced.toString() })
    .groupBy('c.entityType')
    .getRawMany<{ entityType: string; cnt: string }>()
  const summary: Record<string, number> = {}
  for (const r of summaryRows) summary[r.entityType] = Number(r.cnt || '0')

  const recent = await baseQb.orderBy('c.id', 'DESC').take(10).getMany()

  const jobRepo = AppDataSource.getRepository(StoreSyncJob)
  const latest = await jobRepo.findOne({
    where: { tenantId: params.tenantId, sourceStoreId: params.sourceStoreId, kind: 'SHARED_CATALOG' as any },
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

  return {
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
  }
}

export async function getPrimaryStoreById(storeId: string) {
  const storeRepo = AppDataSource.getRepository(Store)
  const s = await storeRepo.findOne({ where: { storeId } })
  if (!s || !s.tenantId || !Number(s.isPrimary)) return null
  return s
}
