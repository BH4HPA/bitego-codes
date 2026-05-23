import { Router } from 'express'
import { In, IsNull } from 'typeorm'
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

async function ensureStoreInTenant(storeId: string, tenantId: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(Store)
  const row = await repo.findOne({ where: { storeId } })
  if (!row || row.deletedAt) return false
  return row.tenantId === tenantId
}

router.get(
  '/api/v1/tenant/users',
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

    const tenantId = ctx.tenantId
    const userType = String(req.query.userType || 'ADMIN').trim()
    const keyword = String(req.query.keyword || '').trim()
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    if (userType === 'ADMIN') {
      const scopeRepo = AppDataSource.getRepository(AdminScope)
      const scopes = await scopeRepo.find({
        where: { tenantId, status: 'ACTIVE', deletedAt: IsNull() },
        order: { createdAt: 'DESC' }
      })
      const filtered = scopes.filter((s) => s.role === 'TENANT_ADMIN' || s.role === 'STORE_ADMIN')
      const userIds = Array.from(new Set(filtered.map((s) => s.userId)))
      if (!userIds.length) {
        ok(res, { list: [], pagination: { page, pageSize, total: 0 } })
        return
      }
      const userRepo = AppDataSource.getRepository(User)
      const qb = userRepo.createQueryBuilder('u').where('u.deletedAt IS NULL').andWhere('u.userId IN (:...userIds)', {
        userIds
      })
      qb.andWhere('u.userType = :userType', { userType: 'ADMIN' })
      if (keyword) {
        qb.andWhere('(u.userId LIKE :kw OR u.username LIKE :kw OR u.nickname LIKE :kw)', {
          kw: `%${keyword}%`
        })
      }
      qb.orderBy('u.createdAt', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
      const [rows, total] = await qb.getManyAndCount()
      const scopeByUserId = new Map<string, AdminScope[]>()
      for (const s of filtered) {
        if (!scopeByUserId.has(s.userId)) scopeByUserId.set(s.userId, [])
        scopeByUserId.get(s.userId)!.push(s)
      }
      const scopeStoreIds = Array.from(new Set(filtered.map((s) => s.storeId).filter(Boolean))) as string[]
      const storeRepo = AppDataSource.getRepository(Store)
      const storeRows = scopeStoreIds.length ? await storeRepo.findBy({ storeId: In(scopeStoreIds) }) : []
      const storeById = new Map(storeRows.filter((s) => !s.deletedAt).map((s) => [s.storeId, s]))
      ok(res, {
        list: rows.map((u) => ({
          userId: u.userId,
          userType: u.userType,
          username: u.username,
          nickname: u.nickname,
          avatarUrl: u.avatarUrl,
          status: u.status,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          lastLoginAt: u.lastLoginAt,
          scopes: (scopeByUserId.get(u.userId) || []).map((s) => {
            const store = s.storeId ? storeById.get(s.storeId) : null
            const storeName = store ? [store.name, store.subName].filter(Boolean).join(' · ') || null : null
            return {
              scopeId: s.scopeId,
              tenantId: s.tenantId,
              storeId: s.storeId,
              storeName,
              role: s.role,
              status: s.status,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt
            }
          })
        })),
        pagination: { page, pageSize, total }
      })
      return
    }

    if (userType === 'CUSTOMER') {
      const orderRepo = AppDataSource.getRepository(Order)
      const countQb = orderRepo
        .createQueryBuilder('o')
        .innerJoin(Store, 's', 's.storeId = o.storeId AND s.deletedAt IS NULL')
        .innerJoin(User, 'u', 'u.userId = o.userId AND u.deletedAt IS NULL')
        .where('o.deletedAt IS NULL')
        .andWhere('s.tenantId = :tenantId', { tenantId })
        .andWhere('u.userType = :userType', { userType: 'CUSTOMER' })
      if (keyword) {
        countQb.andWhere(
          '(u.userId LIKE :kw OR u.nickname LIKE :kw OR u.wechatOpenid LIKE :kw OR u.wechatUnionid LIKE :kw)',
          {
            kw: `%${keyword}%`
          }
        )
      }
      const totalRow = await countQb.select('COUNT(DISTINCT o.userId)', 'cnt').getRawOne()
      const total = parseInt(String((totalRow as any)?.cnt || '0'), 10) || 0
      if (!total) {
        ok(res, { list: [], pagination: { page, pageSize, total: 0 } })
        return
      }

      const qb = orderRepo
        .createQueryBuilder('o')
        .innerJoin(Store, 's', 's.storeId = o.storeId AND s.deletedAt IS NULL')
        .innerJoin(User, 'u', 'u.userId = o.userId AND u.deletedAt IS NULL')
        .where('o.deletedAt IS NULL')
        .andWhere('s.tenantId = :tenantId', { tenantId })
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
  '/api/v1/tenant/users/:userId',
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
    const tenantId = ctx.tenantId
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

    const scopes = await scopeRepo.find({
      where: { userId, tenantId, status: 'ACTIVE', deletedAt: IsNull() },
      order: { createdAt: 'DESC' }
    })
    if (!scopes.length) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    const storeIds = Array.from(new Set(scopes.map((s) => s.storeId).filter(Boolean))) as string[]
    const storeRepo = AppDataSource.getRepository(Store)
    const stores = storeIds.length ? await storeRepo.findBy({ storeId: In(storeIds) }) : []
    const storeById = new Map(stores.filter((s) => !s.deletedAt).map((s) => [s.storeId, s]))

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
      scopes: scopes.map((s) => {
        const store = s.storeId ? storeById.get(s.storeId) : null
        const storeName = store ? [store.name, store.subName].filter(Boolean).join(' · ') || null : null
        return {
          scopeId: s.scopeId,
          tenantId: s.tenantId,
          storeId: s.storeId,
          storeName,
          role: s.role,
          status: s.status,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        }
      })
    })
  })
)

router.post(
  '/api/v1/tenant/admin-users',
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
    const tenantId = ctx.tenantId

    const username = normalizeString(req.body?.username)
    const password = typeof req.body?.password === 'string' ? String(req.body.password) : ''
    const nickname = normalizeOptionalString(req.body?.nickname)
    const avatarUrl = normalizeOptionalString(req.body?.avatarUrl)
    const roleRaw = normalizeOptionalString(req.body?.role)
    const storeId = normalizeOptionalString(req.body?.storeId)

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenant = await tenantRepo.findOne({ where: { tenantId } })
    if (!tenant || tenant.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }
    const isSingle = tenant.type === 'SINGLE'

    const role =
      roleRaw === undefined || roleRaw === null
        ? isSingle
          ? 'TENANT_ADMIN'
          : 'STORE_ADMIN'
        : roleRaw === 'TENANT_ADMIN'
          ? 'TENANT_ADMIN'
          : roleRaw === 'STORE_ADMIN'
            ? 'STORE_ADMIN'
            : null

    if (!username || username.length > 50 || !password || password.length < 6 || !role) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    if (isSingle && role === 'STORE_ADMIN') {
      res.status(400).json({ success: false, code: 40000, message: '单店租户只允许创建租户管理员', data: null })
      return
    }
    if (role === 'TENANT_ADMIN') {
      if (storeId !== undefined && storeId !== null) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
        return
      }
    }
    if (role === 'STORE_ADMIN') {
      if (!storeId) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
        return
      }
      const okStore = await ensureStoreInTenant(storeId, tenantId)
      if (!okStore) {
        res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
        return
      }
    }
    if (nickname !== undefined && nickname !== null && nickname.length > 20) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid nickname', data: null })
      return
    }
    if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl.length > 500) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid avatarUrl', data: null })
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
        tenantId,
        storeId: role === 'STORE_ADMIN' ? (storeId as string) : null,
        role,
        status: 'ACTIVE'
      })
      await scopeRepoTx.save(scope)
      scopeId = scope.scopeId
    })
    ok(res, { userId, scopeId }, 'Created')
  })
)

export default router
