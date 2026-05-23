import { Router } from 'express'
import multer from 'multer'
import { AppDataSource } from '../db'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { buildPublicUrl, cosPutObject } from '../qcloud/cos'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { setMaintenanceState } from '../services/maintenance'
import { bumpGlobalTokenVersion } from '../services/tokenVersion'
import { ensureStoreDefaultTenantAndStore } from '../bootstrap/ensureStoreDefault'
import { Notification } from '../entities/Notification'
import { emitAdminNotification } from '../ws/notificationBus'
import { genId } from '../utils/id'

type PlatformSnapshotV1 = {
  version: 1
  exportedAt: string
  tables: Array<{ name: string; rows: Array<Record<string, unknown>> }>
}

type ImportWarning =
  | { kind: 'UNKNOWN_TABLE'; table: string; rowCount: number }
  | { kind: 'DROPPED_COLUMNS'; table: string; columns: string[] }
  | { kind: 'MISSING_TABLE'; table: string }

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
})

const EXCLUDED_TABLE_NAMES = new Set<string>(['migrations', 'store_default_migration_log'])

const ISO_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const MAX_PLACEHOLDERS_PER_INSERT = 20000

function getPlatformSnapshotMetas() {
  return AppDataSource.entityMetadatas.filter((m) => !EXCLUDED_TABLE_NAMES.has(m.tableName))
}

function buildLocalColumnsByTable(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const m of getPlatformSnapshotMetas()) {
    map.set(m.tableName, new Set(m.columns.map((c) => c.databaseName)))
  }
  return map
}

function normalizeValue(v: unknown) {
  if (typeof v !== 'string') return v
  if (!ISO_TIME_RE.test(v)) return v
  return v.replace('T', ' ').replace('Z', '')
}

router.get(
  '/api/v1/platform/snapshot/export',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    const metas = getPlatformSnapshotMetas()
    const tables: PlatformSnapshotV1['tables'] = []
    for (const m of metas) {
      const hasDeletedAt = m.columns.some((c) => c.databaseName === 'deletedAt')
      const rows = (await AppDataSource.query(
        hasDeletedAt
          ? `SELECT * FROM \`${m.tableName}\` WHERE \`deletedAt\` IS NULL`
          : `SELECT * FROM \`${m.tableName}\``
      )) as Array<Record<string, unknown>>
      tables.push({ name: m.tableName, rows })
    }
    const snapshot: PlatformSnapshotV1 = { version: 1, exportedAt: new Date().toISOString(), tables }
    const bodyStr = JSON.stringify(snapshot)
    const key = `platform_snapshots/${Date.now()}_${Math.floor(Math.random() * 10000)}.json`
    await cosPutObject({ key, body: Buffer.from(bodyStr, 'utf8'), contentType: 'application/json' })
    ok(res, { key, url: buildPublicUrl(key), bytes: Buffer.byteLength(bodyStr, 'utf8') }, 'Exported')
  })
)

router.post(
  '/api/v1/platform/snapshot/import',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  (req, res, next) => {
    const handler = upload.single('file') as unknown as (req: any, res: any, next: (err?: unknown) => void) => void
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
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing file', data: null })
      return
    }
    let snapshot: PlatformSnapshotV1
    try {
      snapshot = JSON.parse(req.file.buffer.toString('utf8'))
    } catch {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid JSON', data: null })
      return
    }
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.tables)) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid snapshot', data: null })
      return
    }

    const localColsByTable = buildLocalColumnsByTable()
    const warnings: ImportWarning[] = []
    const snapshotTableNames = new Set<string>()

    await setMaintenanceState(true, '平台恢复中，请稍后重试')
    await bumpGlobalTokenVersion()
    try {
      await AppDataSource.transaction(async (mgr) => {
        await mgr.query('SET FOREIGN_KEY_CHECKS = 0')
        try {
          // Phase 1: clear every known data table. DELETE (not TRUNCATE) keeps the transaction
          // actually atomic — TRUNCATE would implicitly COMMIT each table and break rollback.
          for (const tableName of localColsByTable.keys()) {
            await mgr.query(`DELETE FROM \`${tableName}\``)
          }
          // Phase 2: insert from snapshot, skipping tables/columns the local schema doesn't know.
          for (const t of snapshot.tables) {
            if (!t || typeof t.name !== 'string') continue
            const rows = Array.isArray(t.rows) ? t.rows : []
            const localCols = localColsByTable.get(t.name)
            if (!localCols) {
              warnings.push({ kind: 'UNKNOWN_TABLE', table: t.name, rowCount: rows.length })
              continue
            }
            snapshotTableNames.add(t.name)
            if (!rows.length) continue
            const snapshotCols = Object.keys(rows[0]!)
            const cols = snapshotCols.filter((c) => localCols.has(c))
            const dropped = snapshotCols.filter((c) => !localCols.has(c))
            if (dropped.length) warnings.push({ kind: 'DROPPED_COLUMNS', table: t.name, columns: dropped })
            if (!cols.length) continue
            const rowsPerBatch = Math.max(1, Math.floor(MAX_PLACEHOLDERS_PER_INSERT / cols.length))
            for (let i = 0; i < rows.length; i += rowsPerBatch) {
              const batch = rows.slice(i, i + rowsPerBatch)
              await mgr.query(
                `INSERT INTO \`${t.name}\` (${cols.map((k) => `\`${k}\``).join(',')}) VALUES ${batch
                  .map(() => `(${cols.map(() => '?').join(',')})`)
                  .join(',')}`,
                batch.flatMap((r) => cols.map((k) => normalizeValue((r as any)[k])))
              )
            }
          }
          // Flag local tables the snapshot didn't cover: Phase 1 emptied them but Phase 2 had
          // nothing to refill with. Caller gets a warning (and a platform notification) so they
          // know which tables were wiped by a partial/cross-version snapshot.
          for (const tableName of localColsByTable.keys()) {
            if (!snapshotTableNames.has(tableName)) {
              warnings.push({ kind: 'MISSING_TABLE', table: tableName })
            }
          }
        } finally {
          await mgr.query('SET FOREIGN_KEY_CHECKS = 1')
        }
      })
      await ensureStoreDefaultTenantAndStore(AppDataSource)
      const restoredAt = new Date().toISOString()
      // Best-effort: caller's JWT is already invalidated by the GTV bump above, so the HTTP
      // response body is invisible to them. The platform notification is how the result reaches
      // the admin on next login — but if the notification write itself fails, it must not turn a
      // successful restore into an apparent failure.
      await safeCreatePlatformRestoreNotification({ outcome: 'SUCCESS', restoredAt, warnings })
      ok(res, { restoredAt, warnings }, 'Restored')
    } catch (err) {
      await safeCreatePlatformRestoreNotification({
        outcome: 'FAILURE',
        errorMessage: err instanceof Error ? err.message : String(err)
      })
      throw err
    } finally {
      await setMaintenanceState(false)
    }
  })
)

async function safeCreatePlatformRestoreNotification(
  params:
    | { outcome: 'SUCCESS'; restoredAt: string; warnings: ImportWarning[] }
    | { outcome: 'FAILURE'; errorMessage: string }
) {
  const repo = AppDataSource.getRepository(Notification)
  const row =
    params.outcome === 'SUCCESS'
      ? repo.create({
          notificationId: genId('ntf'),
          type: 'PLATFORM_RESTORE_SUCCEEDED',
          title: '平台数据恢复完成',
          message: params.warnings.length
            ? `恢复成功，有 ${params.warnings.length} 条警告，请查看详情`
            : '恢复成功，无警告',
          orderId: null,
          tableId: null,
          tableCode: null,
          tenantId: null,
          storeId: null,
          status: 'UNREAD',
          readAt: null,
          handledAt: null,
          payload: { restoredAt: params.restoredAt, warnings: params.warnings }
        })
      : repo.create({
          notificationId: genId('ntf'),
          type: 'PLATFORM_RESTORE_FAILED',
          title: '平台数据恢复失败',
          message: params.errorMessage.slice(0, 500),
          orderId: null,
          tableId: null,
          tableCode: null,
          tenantId: null,
          storeId: null,
          status: 'UNREAD',
          readAt: null,
          handledAt: null,
          payload: { errorMessage: params.errorMessage }
        })
  try {
    await repo.save(row)
    emitAdminNotification({ notificationId: row.notificationId })
  } catch {
    // best-effort; don't let notification failure mask the actual restore outcome
  }
}

router.post(
  '/api/v1/platform/snapshot/reset',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    await setMaintenanceState(true, '平台清空中，请稍后重试')
    await bumpGlobalTokenVersion()
    try {
      await AppDataSource.transaction(async (mgr) => {
        await mgr.query('SET FOREIGN_KEY_CHECKS = 0')
        try {
          for (const m of getPlatformSnapshotMetas()) {
            if (m.tableName === 'admin_scopes' || m.tableName === 'users') continue
            await mgr.query(`DELETE FROM \`${m.tableName}\``)
          }
        } finally {
          await mgr.query('SET FOREIGN_KEY_CHECKS = 1')
        }
      })
      await ensureStoreDefaultTenantAndStore(AppDataSource)
      ok(res, { resetAt: new Date().toISOString() }, 'Reset')
    } finally {
      await setMaintenanceState(false)
    }
  })
)

export default router
