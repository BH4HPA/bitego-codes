import { Router } from 'express'
import { In } from 'typeorm'
import { AppDataSource } from '../db'
import { AdminScope } from '../entities/AdminScope'
import { Order } from '../entities/Order'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { User } from '../entities/User'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { getAdminContext, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'
import { hashPassword } from '../utils/password'

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

router.get(
  '/api/v1/store/users',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx || !ctx.storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing store context', data: null })
      return
    }

    const storeId = ctx.storeId
    const tenantId = ctx.tenantId
    const userType = String(req.query.userType || 'ADMIN').trim()
    const keyword = String(req.query.keyword || '').trim()
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    if (userType === 'ADMIN') {
      const scopeRepo = AppDataSource.getRepository(AdminScope)
      const qb = scopeRepo
        .createQueryBuilder('s')
        .where('s.deletedAt IS NULL')
        .andWhere('s.status = :status', { status: 'ACTIVE' })
        .andWhere('s.tenantId = :tenantId', { tenantId })
        .andWhere('s.storeId = :storeId', { storeId })
        .andWhere('s.role = :role', { role: 'STORE_ADMIN' })
      qb.orderBy('s.createdAt', 'DESC')
      const [scopes, total] = await qb
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount()
      const userIds = Array.from(new Set(scopes.map((s) => s.userId)))
      const userRepo = AppDataSource.getRepository(User)
      const users = userIds.length ? await userRepo.findBy({ userId: In(userIds) }) : []
      const userById = new Map<string, User>()
      for (const u of users) if (!u.deletedAt) userById.set(u.userId, u)

      const list = scopes
        .map((s) => ({ scope: s, user: userById.get(s.userId) || null }))
        .filter((x) => x.user && x.user!.userType === 'ADMIN')
        .filter((x) => {
          if (!keyword) return true
          const u = x.user!
          const v = `${u.userId} ${u.username || ''} ${u.nickname || ''}`
          return v.includes(keyword)
        })
        .map((x) => ({
          userId: x.user!.userId,
          userType: x.user!.userType,
          username: x.user!.username,
          nickname: x.user!.nickname,
          avatarUrl: x.user!.avatarUrl,
          status: x.user!.status,
          createdAt: x.user!.createdAt,
          updatedAt: x.user!.updatedAt,
          lastLoginAt: x.user!.lastLoginAt,
          scopes: [
            {
              scopeId: x.scope.scopeId,
              tenantId: x.scope.tenantId,
              storeId: x.scope.storeId,
              role: x.scope.role,
              status: x.scope.status,
              createdAt: x.scope.createdAt,
              updatedAt: x.scope.updatedAt
            }
          ]
        }))

      ok(res, { list, pagination: { page, pageSize, total } })
      return
    }

    if (userType === 'CUSTOMER') {
      const orderRepo = AppDataSource.getRepository(Order)
      const countRow = await orderRepo
        .createQueryBuilder('o')
        .select('COUNT(DISTINCT o.userId)', 'cnt')
        .innerJoin(User, 'u', 'u.userId = o.userId AND u.deletedAt IS NULL')
        .where('o.deletedAt IS NULL')
        .andWhere('o.storeId = :storeId', { storeId })
        .andWhere('u.userType = :userType', { userType: 'CUSTOMER' })
        .getRawOne()
      const total = parseInt(String((countRow as any)?.cnt || '0'), 10) || 0
      if (!total) {
        ok(res, { list: [], pagination: { page, pageSize, total: 0 } })
        return
      }

      const qb = orderRepo
        .createQueryBuilder('o')
        .innerJoin(User, 'u', 'u.userId = o.userId AND u.deletedAt IS NULL')
        .where('o.deletedAt IS NULL')
        .andWhere('o.storeId = :storeId', { storeId })
        .andWhere('u.userType = :userType', { userType: 'CUSTOMER' })
      if (keyword) {
        qb.andWhere(
          '(u.userId LIKE :kw OR u.nickname LIKE :kw OR u.wechatOpenid LIKE :kw OR u.wechatUnionid LIKE :kw)',
          {
            kw: `%${keyword}%`
          }
        )
      }
      const rows = await qb
        .select('o.userId', 'userId')
        .addSelect('MAX(o.createdAt)', 'lastOrderAt')
        .groupBy('o.userId')
        .orderBy('lastOrderAt', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getRawMany()
      const userIds = rows.map((r: any) => String(r.userId)).filter(Boolean)
      const lastOrderAtByUserId = new Map<string, string>()
      for (const r of rows as any[]) lastOrderAtByUserId.set(String(r.userId), String(r.lastOrderAt || ''))

      const userRepo = AppDataSource.getRepository(User)
      const users = userIds.length ? await userRepo.findBy({ userId: In(userIds) }) : []
      const userById = new Map<string, User>()
      for (const u of users) if (!u.deletedAt) userById.set(u.userId, u)

      ok(res, {
        list: userIds
          .map((userId) => userById.get(userId))
          .filter(Boolean)
          .map((u) => ({
            userId: u!.userId,
            userType: u!.userType,
            nickname: u!.nickname,
            avatarUrl: u!.avatarUrl,
            wechatOpenid: u!.wechatOpenid,
            wechatUnionid: u!.wechatUnionid,
            status: u!.status,
            createdAt: u!.createdAt,
            updatedAt: u!.updatedAt,
            lastLoginAt: u!.lastLoginAt,
            lastOrderAt: lastOrderAtByUserId.get(u!.userId) || null
          })),
        pagination: { page, pageSize, total }
      })
      return
    }

    res.status(400).json({ success: false, code: 40000, message: 'Invalid userType', data: null })
  })
)

router.get(
  '/api/v1/store/users/:userId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx || !ctx.storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing store context', data: null })
      return
    }
    const userId = String(req.params.userId || '').trim()
    if (!userId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid userId', data: null })
      return
    }

    const userRepo = AppDataSource.getRepository(User)
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const row = await userRepo.findOne({ where: { userId } })
    if (!row || row.deletedAt || row.userType !== 'ADMIN') {
      res.status(404).json({ success: false, code: 40400, message: 'User not found', data: null })
      return
    }

    const scopes = await scopeRepo
      .createQueryBuilder('s')
      .where('s.deletedAt IS NULL')
      .andWhere('s.status = :status', { status: 'ACTIVE' })
      .andWhere('s.userId = :userId', { userId })
      .andWhere('s.tenantId = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('s.storeId = :storeId', { storeId: ctx.storeId })
      .orderBy('s.createdAt', 'DESC')
      .getMany()
    if (!scopes.length) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    const storeRepo = AppDataSource.getRepository(Store)
    const store = await storeRepo.findOne({ where: { storeId: ctx.storeId } })
    const storeName = store && !store.deletedAt ? [store.name, store.subName].filter(Boolean).join(' · ') || null : null

    ok(res, {
      user: {
        userId: row.userId,
        userType: row.userType,
        username: row.username,
        nickname: row.nickname,
        avatarUrl: row.avatarUrl,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastLoginAt: row.lastLoginAt
      },
      scopes: scopes.map((s) => ({
        scopeId: s.scopeId,
        tenantId: s.tenantId,
        storeId: s.storeId,
        storeName,
        role: s.role,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    })
  })
)

router.post(
  '/api/v1/store/admin-users',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('STORE_ADMIN'),
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx || !ctx.storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing store context', data: null })
      return
    }

    const username = normalizeString(req.body?.username)
    const password = typeof req.body?.password === 'string' ? String(req.body.password) : ''
    const nickname = normalizeOptionalString(req.body?.nickname)
    const avatarUrl = normalizeOptionalString(req.body?.avatarUrl)

    if (!username || username.length > 50 || !password || password.length < 6) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
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

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenant = await tenantRepo.findOne({ where: { tenantId: ctx.tenantId } })
    if (tenant && !tenant.deletedAt && tenant.type === 'SINGLE') {
      res
        .status(400)
        .json({ success: false, code: 40000, message: '单店租户只允许创建租户管理员，请在租户视角添加', data: null })
      return
    }

    const userRepo = AppDataSource.getRepository(User)
    const existed = await userRepo.findOne({ where: { username } })
    if (existed && !existed.deletedAt) {
      res.status(400).json({ success: false, code: 40000, message: 'Username already exists', data: null })
      return
    }

    const userId = genId('admin')
    let scopeId = ''
    await AppDataSource.transaction(async (manager) => {
      const userRepoTx = manager.getRepository(User)
      const scopeRepoTx = manager.getRepository(AdminScope)
      const row = userRepoTx.create({
        userId,
        userType: 'ADMIN',
        username,
        passwordHash: hashPassword(password),
        wechatOpenid: null,
        wechatUnionid: null,
        nickname: nickname === undefined ? username : nickname || username,
        avatarUrl: avatarUrl === undefined ? '' : avatarUrl || '',
        phoneNumber: null,
        status: 'ACTIVE'
      })
      await userRepoTx.save(row)
      const scope = scopeRepoTx.create({
        scopeId: genId('sc'),
        userId,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        role: 'STORE_ADMIN',
        status: 'ACTIVE'
      })
      await scopeRepoTx.save(scope)
      scopeId = scope.scopeId
    })
    ok(res, { userId, scopeId }, 'Created')
  })
)

export default router
