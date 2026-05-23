import { Router } from 'express'
import { AppDataSource } from '../db'
import { Notification } from '../entities/Notification'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { getAdminContext, requireAdminContext } from '../middlewares/adminAuthz'

const router = Router()

function applyNotificationContextFilter(qb: any, alias: string, ctx: ReturnType<typeof getAdminContext>) {
  if (!ctx) return
  if (ctx.board === 'platform') {
    qb.andWhere(`${alias}.tenantId IS NULL`)
    qb.andWhere(`${alias}.storeId IS NULL`)
    return
  }
  if (ctx.board === 'tenant') {
    qb.andWhere(`${alias}.tenantId = :tenantId`, { tenantId: ctx.tenantId })
    qb.andWhere(`${alias}.storeId IS NULL`)
    return
  }
  if (!ctx.storeId) {
    qb.andWhere('1 = 0')
    return
  }
  qb.andWhere(`${alias}.storeId = :storeId`, { storeId: ctx.storeId })
}

router.get(
  '/api/v1/admin/notifications',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim()
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    const repo = AppDataSource.getRepository(Notification)
    const qb = repo.createQueryBuilder('n').where('n.deletedAt IS NULL')
    const ctx = getAdminContext(req)
    applyNotificationContextFilter(qb, 'n', ctx)
    if (status) qb.andWhere('n.status = :status', { status })
    qb.orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    const [rows, total] = await qb.getManyAndCount()
    ok(res, { list: rows, pagination: { page, pageSize, total } })
  })
)

router.put(
  '/api/v1/admin/notifications/:notificationId/read',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { notificationId } = req.params
    const repo = AppDataSource.getRepository(Notification)
    const ctx = getAdminContext(req)
    const qb = repo.createQueryBuilder('n').where('n.notificationId = :notificationId', { notificationId })
    applyNotificationContextFilter(qb, 'n', ctx)
    const row = await qb.getOne()
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'Not found', data: null })
      return
    }
    if (row.status === 'UNREAD') {
      row.status = 'READ'
      row.readAt = new Date()
      await repo.save(row)
    }
    ok(res, { notificationId, status: row.status }, 'Updated')
  })
)

router.put(
  '/api/v1/admin/notifications/read-all',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (_req, res) => {
    const repo = AppDataSource.getRepository(Notification)
    const now = new Date()
    const ctx = getAdminContext(_req as any)
    const qb = repo
      .createQueryBuilder()
      .update(Notification)
      .set({ status: 'READ', readAt: now })
      .where('deletedAt IS NULL')
      .andWhere('status = :status', { status: 'UNREAD' })
    if (ctx) {
      if (ctx.board === 'platform') {
        qb.andWhere('tenantId IS NULL')
        qb.andWhere('storeId IS NULL')
      } else if (ctx.board === 'tenant') {
        qb.andWhere('tenantId = :tenantId', { tenantId: ctx.tenantId })
        qb.andWhere('storeId IS NULL')
      } else if (ctx.storeId) {
        qb.andWhere('storeId = :storeId', { storeId: ctx.storeId })
      } else {
        qb.andWhere('1 = 0')
      }
    }
    const r = await qb.execute()
    ok(res, { updated: r.affected || 0 }, 'Updated')
  })
)

router.put(
  '/api/v1/admin/notifications/:notificationId/handled',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { notificationId } = req.params
    const repo = AppDataSource.getRepository(Notification)
    const ctx = getAdminContext(req)
    const qb = repo.createQueryBuilder('n').where('n.notificationId = :notificationId', { notificationId })
    applyNotificationContextFilter(qb, 'n', ctx)
    const row = await qb.getOne()
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'Not found', data: null })
      return
    }
    row.status = 'HANDLED'
    if (!row.readAt) row.readAt = new Date()
    row.handledAt = new Date()
    await repo.save(row)
    ok(res, { notificationId, status: row.status }, 'Updated')
  })
)

export default router
