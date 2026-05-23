import { Router } from 'express'
import { AppDataSource } from '../db'
import { AdminScope } from '../entities/AdminScope'
import { User } from '../entities/User'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAuth, requireAdmin, getAuthUser } from '../middlewares/auth'
import { getAdminContext, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'
import { hashPassword, verifyPassword } from '../utils/password'

const router = Router()

router.get(
  '/api/v1/admin/users',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const userType = String(req.query.userType || '').trim()
    const keyword = String(req.query.keyword || '').trim()
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    const repo = AppDataSource.getRepository(User)
    const qb = repo.createQueryBuilder('u').where('u.deletedAt IS NULL')
    if (userType) qb.andWhere('u.userType = :userType', { userType })
    if (keyword) {
      qb.andWhere(
        '(u.userId LIKE :kw OR u.username LIKE :kw OR u.nickname LIKE :kw OR u.wechatOpenid LIKE :kw OR u.wechatUnionid LIKE :kw)',
        { kw: `%${keyword}%` }
      )
    }
    qb.orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    const [rows, total] = await qb.getManyAndCount()
    ok(res, {
      list: rows.map((u) => ({
        userId: u.userId,
        userType: u.userType,
        username: u.username,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        wechatOpenid: u.wechatOpenid,
        wechatUnionid: u.wechatUnionid,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        lastLoginAt: u.lastLoginAt
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.post(
  '/api/v1/admin/users',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { username, password, nickname, avatarUrl } = req.body || {}
    const u = String(username || '').trim()
    const p = String(password || '')
    const n = typeof nickname === 'string' ? nickname.trim() : ''
    const a = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''
    if (!u || u.length > 50 || !p || p.length < 6) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    if (n && n.length > 20) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid nickname', data: null })
      return
    }
    if (a && a.length > 500) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid avatarUrl', data: null })
      return
    }
    const repo = AppDataSource.getRepository(User)
    const existed = await repo.findOne({ where: { username: u } })
    if (existed) {
      res.status(400).json({ success: false, code: 40000, message: 'Username already exists', data: null })
      return
    }
    const row = repo.create({
      userId: genId('admin'),
      userType: 'ADMIN',
      username: u,
      passwordHash: hashPassword(p),
      wechatOpenid: null,
      wechatUnionid: null,
      nickname: n || u,
      avatarUrl: a || '',
      phoneNumber: null,
      status: 'ACTIVE'
    })
    await repo.save(row)
    ok(
      res,
      {
        userId: row.userId,
        userType: row.userType,
        username: row.username,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl,
        status: row.status,
        createdAt: row.createdAt
      },
      'Created'
    )
  })
)

router.delete(
  '/api/v1/admin/users/:userId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params
    const auth = getAuthUser(req)
    if (auth?.userId === userId) {
      res.status(400).json({ success: false, code: 40000, message: 'Cannot delete self', data: null })
      return
    }
    const repo = AppDataSource.getRepository(User)
    const row = await repo.findOne({ where: { userId } })
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'User not found', data: null })
      return
    }
    if (row.userType !== 'ADMIN') {
      res.status(400).json({ success: false, code: 40000, message: 'Only admin deletable', data: null })
      return
    }
    await repo.softDelete({ userId })
    ok(res, { userId }, 'Deleted')
  })
)

router.put(
  '/api/v1/admin/me/password',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body || {}
    const oldPwd = String(oldPassword || '')
    const newPwd = String(newPassword || '')
    if (!oldPwd || !newPwd || newPwd.length < 6) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    const auth = getAuthUser(req)
    const repo = AppDataSource.getRepository(User)
    const row = auth?.userId ? await repo.findOne({ where: { userId: auth.userId } }) : null
    if (!row || row.userType !== 'ADMIN') {
      res.status(404).json({ success: false, code: 40400, message: 'User not found', data: null })
      return
    }
    if (!row.passwordHash || !verifyPassword(oldPwd, row.passwordHash)) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid oldPassword', data: null })
      return
    }
    row.passwordHash = hashPassword(newPwd)
    await repo.save(row)
    ok(res, { userId: row.userId }, 'Updated')
  })
)

async function ensureTargetWithinAuthz(
  actorCtx: ReturnType<typeof getAdminContext>,
  targetUserId: string
): Promise<{ ok: true; user: User } | { ok: false; status: number; message: string }> {
  if (!actorCtx) return { ok: false, status: 400, message: 'Missing context' }
  const userRepo = AppDataSource.getRepository(User)
  const user = await userRepo.findOne({ where: { userId: targetUserId } })
  if (!user || user.deletedAt || user.userType !== 'ADMIN') {
    return { ok: false, status: 404, message: 'User not found' }
  }
  if (actorCtx.adminRole === 'SUPER_ADMIN') return { ok: true, user }

  const scopeRepo = AppDataSource.getRepository(AdminScope)
  const qb = scopeRepo
    .createQueryBuilder('s')
    .where('s.deletedAt IS NULL')
    .andWhere('s.status = :status', { status: 'ACTIVE' })
    .andWhere('s.userId = :userId', { userId: targetUserId })
    .andWhere('s.tenantId = :tenantId', { tenantId: actorCtx.tenantId })
  if (actorCtx.adminRole === 'STORE_ADMIN') {
    if (!actorCtx.storeId) return { ok: false, status: 400, message: 'Missing store context' }
    qb.andWhere('s.storeId = :storeId', { storeId: actorCtx.storeId })
  }
  const count = await qb.getCount()
  if (!count) return { ok: false, status: 403, message: 'Forbidden' }
  return { ok: true, user }
}

function normalizeOptionalStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s ? s : null
}

router.put(
  '/api/v1/admin/users/:userId/profile',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    const userId = String(req.params.userId || '').trim()
    const auth = getAuthUser(req)
    if (!userId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid userId', data: null })
      return
    }
    if (auth?.userId === userId) {
      res.status(400).json({ success: false, code: 40000, message: 'Use /users/me for self edits', data: null })
      return
    }
    const guard = await ensureTargetWithinAuthz(ctx, userId)
    if (!guard.ok) {
      res.status(guard.status).json({ success: false, code: guard.status * 100, message: guard.message, data: null })
      return
    }

    const nickname = normalizeOptionalStr(req.body?.nickname)
    const avatarUrl = normalizeOptionalStr(req.body?.avatarUrl)
    if (nickname === undefined && avatarUrl === undefined) {
      res.status(400).json({ success: false, code: 40000, message: 'Nothing to update', data: null })
      return
    }
    if (nickname !== undefined && nickname !== null && nickname.length > 20) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid nickname', data: null })
      return
    }
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl.length > 500) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid avatarUrl', data: null })
      return
    }

    const repo = AppDataSource.getRepository(User)
    const row = guard.user
    if (nickname !== undefined) row.nickname = nickname ?? row.username ?? row.userId
    if (avatarUrl !== undefined) row.avatarUrl = avatarUrl ?? ''
    await repo.save(row)
    ok(
      res,
      {
        userId: row.userId,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl
      },
      'Updated'
    )
  })
)

router.post(
  '/api/v1/admin/users/:userId/reset-password',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    const userId = String(req.params.userId || '').trim()
    const auth = getAuthUser(req)
    if (!userId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid userId', data: null })
      return
    }
    if (auth?.userId === userId) {
      res
        .status(400)
        .json({ success: false, code: 40000, message: 'Use /admin/me/password for self edits', data: null })
      return
    }
    const guard = await ensureTargetWithinAuthz(ctx, userId)
    if (!guard.ok) {
      res.status(guard.status).json({ success: false, code: guard.status * 100, message: guard.message, data: null })
      return
    }

    const newPassword = typeof req.body?.newPassword === 'string' ? String(req.body.newPassword) : ''
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid newPassword', data: null })
      return
    }
    const row = guard.user
    row.passwordHash = hashPassword(newPassword)
    await AppDataSource.getRepository(User).save(row)
    ok(res, { userId: row.userId }, 'Updated')
  })
)

router.get(
  '/api/v1/admin/users/search',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const keyword = String(req.query.keyword || '').trim()
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20) || 20))

    const repo = AppDataSource.getRepository(User)
    const qb = repo
      .createQueryBuilder('u')
      .where('u.deletedAt IS NULL')
      .andWhere('u.userType = :userType', { userType: 'ADMIN' })
    if (keyword) {
      qb.andWhere('(u.userId LIKE :kw OR u.username LIKE :kw OR u.nickname LIKE :kw)', { kw: `%${keyword}%` })
    }
    qb.orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    const [rows, total] = await qb.getManyAndCount()
    ok(res, {
      list: rows.map((u) => ({
        userId: u.userId,
        username: u.username,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        lastLoginAt: u.lastLoginAt
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.get(
  '/api/v1/admin/users/username-available',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const username = String(req.query.username || '').trim()
    if (!username || username.length > 50) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid username', data: null })
      return
    }
    const repo = AppDataSource.getRepository(User)
    const existed = await repo.findOne({ where: { username, userType: 'ADMIN' } })
    ok(res, { username, available: !existed || Boolean(existed.deletedAt) })
  })
)

export default router
