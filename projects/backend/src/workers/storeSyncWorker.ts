import { AppDataSource } from '../db'
import { StoreSyncJob } from '../entities/StoreSyncJob'
import { Notification } from '../entities/Notification'
import { Tenant } from '../entities/Tenant'
import { withRedisLock } from '../redis'
import { syncSharedCatalogForStore } from '../services/storeSyncService'
import { emitAdminNotification } from '../ws/notificationBus'
import { genId } from '../utils/id'

async function createNotification(params: {
  type: string
  title: string
  message: string
  tenantId: string | null
  storeId: string | null
  payload?: unknown
}) {
  const repo = AppDataSource.getRepository(Notification)
  const row = repo.create({
    notificationId: genId('ntf'),
    type: params.type,
    title: params.title,
    message: params.message,
    orderId: null,
    tableId: null,
    tableCode: null,
    tenantId: params.tenantId,
    storeId: params.storeId,
    status: 'UNREAD',
    readAt: null,
    handledAt: null,
    payload: params.payload ?? null
  })
  await repo.save(row)
  emitAdminNotification({ notificationId: row.notificationId })
}

async function finishBatchIfNeeded(batchId: string) {
  const repo = AppDataSource.getRepository(StoreSyncJob)
  const all = await repo.find({ where: { kind: 'SHARED_CATALOG', batchId } })
  if (!all.length) return
  const rest = all.filter((j) => j.status === 'PENDING' || j.status === 'RUNNING')
  if (rest.length) return

  const failedRelated = all.filter((j) => j.status === 'FAILED')
  const succeededRelated = all.filter((j) => j.status === 'SUCCEEDED')
  const tenantId = all[0].tenantId
  const sourceStoreId = all[0].sourceStoreId
  const upTo = all
    .map((j) => (j.upToChangeId ? BigInt(String(j.upToChangeId)) : null))
    .filter((x): x is bigint => x !== null)
    .reduce((a, b) => (a > b ? a : b), 0n)

  if (!failedRelated.length && upTo > 0n) {
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const t = await tenantRepo.findOne({ where: { tenantId } })
    if (t) {
      t.lastSyncedChangeId = upTo.toString()
      t.lastSyncedAt = new Date()
      await tenantRepo.save(t)
    }
  }

  await createNotification({
    type: 'STORE_SYNC_BATCH_FINISHED',
    title: '连锁共享数据同步完成',
    message: failedRelated.length
      ? `已完成同步，成功 ${succeededRelated.length} 家，失败 ${failedRelated.length} 家`
      : '已完成同步，所有门店已更新',
    tenantId: tenantId || null,
    storeId: null,
    payload: {
      batchId,
      succeeded: succeededRelated.length,
      failed: failedRelated.map((x) => ({ targetStoreId: x.targetStoreId, errorMessage: x.errorMessage }))
    }
  })
}

export async function runStoreSyncWorkerOnce() {
  const repo = AppDataSource.getRepository(StoreSyncJob)
  const jobs = await repo.find({ where: { status: 'PENDING' }, order: { id: 'ASC' }, take: 5 })
  for (const j of jobs) {
    const r = await repo
      .createQueryBuilder()
      .update(StoreSyncJob)
      .set({ status: 'RUNNING', startedAt: new Date(), errorMessage: null })
      .where('id = :id AND status = :status', { id: j.id, status: 'PENDING' })
      .execute()
    if (!(r.affected || 0)) continue

    try {
      if (j.kind !== 'SHARED_CATALOG') throw new Error(`Unsupported job kind: ${j.kind}`)
      const payload = (j.payload && typeof j.payload === 'object' ? (j.payload as any) : {}) as any
      const tenantId = payload.tenantId || j.tenantId
      const sourceStoreId = payload.sourceStoreId || j.sourceStoreId
      const result = await AppDataSource.transaction(async (manager) => {
        return await syncSharedCatalogForStore({ manager, sourceStoreId, targetStoreId: j.targetStoreId })
      })
      j.status = 'SUCCEEDED'
      j.finishedAt = new Date()
      j.errorMessage = null
      j.payload = { ...payload, result }
      await repo.save(j)

      const pickNames = (arr: Array<{ name: string }>) => {
        const names = (Array.isArray(arr) ? arr : [])
          .map((x) => String(x?.name || '').trim())
          .filter(Boolean)
          .slice(0, 5)
        return names.length ? names.join('、') : ''
      }
      const goodsNames = pickNames((result as any)?.created?.goods || [])
      const catNames = pickNames((result as any)?.created?.categories || [])
      const groupNames = pickNames((result as any)?.created?.sharedSpecGroups || [])
      const extra = [
        catNames ? `分类：${catNames}` : '',
        groupNames ? `规格组：${groupNames}` : '',
        goodsNames ? `菜品：${goodsNames}` : ''
      ]
        .filter(Boolean)
        .join('；')

      await createNotification({
        type: 'STORE_SYNC_APPLIED',
        title: '连锁共享数据已同步到本店',
        message: `分类新增 ${result.categoryCreated}、更新 ${result.categoryUpdated}；规格组新增 ${result.sharedSpecGroupCreated}、更新 ${result.sharedSpecGroupUpdated}；菜品新增 ${result.goodCreated}、更新 ${result.goodUpdated}（新增菜品默认下架，SKU 默认库存 0）${
          extra ? `；本次新增：${extra}` : ''
        }`,
        tenantId: tenantId || null,
        storeId: j.targetStoreId,
        payload: {
          batchId: j.batchId || payload.batchId || null,
          sourceStoreId,
          targetStoreId: j.targetStoreId,
          result
        }
      })

      if (j.batchId) await finishBatchIfNeeded(String(j.batchId))
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error'
      j.status = 'FAILED'
      j.finishedAt = new Date()
      j.errorMessage = msg
      await repo.save(j)
      const payload = (j.payload && typeof j.payload === 'object' ? (j.payload as any) : {}) as any
      const tenantId = payload.tenantId || j.tenantId
      await createNotification({
        type: 'STORE_SYNC_FAILED',
        title: '连锁共享数据同步失败',
        message: msg,
        tenantId: tenantId || null,
        storeId: j.targetStoreId,
        payload: { batchId: j.batchId || payload.batchId || null, targetStoreId: j.targetStoreId, errorMessage: msg }
      })
      if (j.batchId) await finishBatchIfNeeded(String(j.batchId))
    }
  }
}

export function startStoreSyncWorker() {
  const intervalMs = parseInt(process.env.STORE_SYNC_WORKER_INTERVAL_MS || '2000', 10)
  setInterval(() => {
    withRedisLock('store-sync-worker', 5000, async () => {
      await runStoreSyncWorkerOnce()
      return true
    }).catch(() => null)
  }, intervalMs)
}
