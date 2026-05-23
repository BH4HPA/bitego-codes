import { Router } from 'express'
import { AppDataSource } from '../db'
import { AdminScope } from '../entities/AdminScope'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { User } from '../entities/User'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth, getAuthUser } from '../middlewares/auth'
import { requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'
import { hashPassword } from '../utils/password'

import { In } from 'typeorm'

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

type ScopeRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN'

function parseRole(v: unknown): ScopeRole | null {
  if (v === 'SUPER_ADMIN' || v === 'TENANT_ADMIN' || v === 'STORE_ADMIN') return v
  return null
}

async function ensureTenantExists(tenantId: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(Tenant)
  const row = await repo.findOne({ where: { tenantId } })
  return Boolean(row && !row.deletedAt)
}

async function ensureStoreInTenant(storeId: string, tenantId: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(Store)
  const row = await repo.findOne({ where: { storeId } })
  if (!row || row.deletedAt) return false
  return row.tenantId === tenantId
}

router.get(
  '/api/v1/platform/users',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const userType = String(req.query.userType || 'ADMIN').trim()
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

router.get(
  '/api/v1/platform/users/:userId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId || '').trim()
    if (!userId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid userId', data: null })
      return
    }

    const userRepo = AppDataSource.getRepository(User)
    const scopeRepo = AppDataSource.getRepository(AdminScope)
    const row = await userRepo.findOne({ where: { userId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'User not found', data: null })
      return
    }
    const scopes = await scopeRepo.find({ where: { userId, status: 'ACTIVE' }, order: { createdAt: 'DESC' } })
    const tenantIds = Array.from(new Set(scopes.map((s) => s.tenantId).filter(Boolean)))
    const storeIds = Array.from(new Set(scopes.map((s) => s.storeId).filter(Boolean)))
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenants = tenantIds.length ? await tenantRepo.findBy({ tenantId: In(tenantIds as string[]) }) : []
    const tenantById = new Map(tenants.filter((t) => !t.deletedAt).map((t) => [t.tenantId, t]))
    const storeRepo = AppDataSource.getRepository(Store)
    const stores = storeIds.length ? await storeRepo.findBy({ storeId: In(storeIds as string[]) }) : []
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
          tenantName: tenantById.get(s.tenantId)?.brandName || null,
          storeId: s.storeId,
          storeName,
          tenantType: tenantById.get(s.tenantId)?.type || null,
          storeIsPrimary: s.storeId ? Number(store?.isPrimary || 0) === 1 : null,
          role: s.role,
          status: s.status,
          createdAt: s.createdAt
        }
      })
    })
  })
)

router.post(
  '/api/v1/platform/users',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const username = normalizeString(req.body?.username)
    const password = typeof req.body?.password === 'string' ? String(req.body.password) : ''
    const nickname = normalizeOptionalString(req.body?.nickname)
    const avatarUrl = normalizeOptionalString(req.body?.avatarUrl)
    const scopes: any[] = Array.isArray(req.body?.scopes) ? req.body.scopes : []

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

    const normalizedScopes = scopes
      .map((s: any) => ({
        tenantId: normalizeString(s?.tenantId),
        storeId: normalizeOptionalString(s?.storeId),
        role: parseRole(s?.role)
      }))
      .filter((s: any) => s.tenantId && s.role)

    const tenantRepo = AppDataSource.getRepository(Tenant)
    for (const s of normalizedScopes) {
      const tenantId = s.tenantId as string
      const role = s.role as ScopeRole
      const storeId = s.storeId
      if (role === 'STORE_ADMIN') {
        if (!storeId) {
          res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
          return
        }
        const tenantRow = await tenantRepo.findOne({ where: { tenantId } })
        if (tenantRow && !tenantRow.deletedAt && tenantRow.type === 'SINGLE') {
          res.status(400).json({ success: false, code: 40000, message: '单店租户不支持门店管理员作用域', data: null })
          return
        }
        const okStore = await ensureStoreInTenant(storeId as string, tenantId)
        if (!okStore) {
          res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
          return
        }
      } else {
        if (storeId !== undefined && storeId !== null) {
          res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
          return
        }
        if (role === 'TENANT_ADMIN') {
          const okTenant = await ensureTenantExists(tenantId)
          if (!okTenant) {
            res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
            return
          }
        }
      }
    }

    const userRepo = AppDataSource.getRepository(User)
    const existed = await userRepo.findOne({ where: { username } })
    if (existed && !existed.deletedAt) {
      res.status(400).json({ success: false, code: 40000, message: 'Username already exists', data: null })
      return
    }

    const userId = genId('admin')
    const scopeIds: string[] = []
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

      for (const s of normalizedScopes) {
        const tenantId = s.tenantId as string
        const role = s.role as ScopeRole
        const storeId = role === 'STORE_ADMIN' ? (s.storeId as string) : null
        const existedScope = await scopeRepoTx
          .createQueryBuilder('sc')
          .where('sc.deletedAt IS NULL')
          .andWhere('sc.userId = :userId', { userId })
          .andWhere('sc.tenantId = :tenantId', { tenantId })
          .andWhere('sc.role = :role', { role })
          .andWhere('sc.status = :status', { status: 'ACTIVE' })
          .andWhere(role === 'STORE_ADMIN' ? 'sc.storeId = :storeId' : 'sc.storeId IS NULL', { storeId })
          .getOne()
        if (existedScope) {
          scopeIds.push(existedScope.scopeId)
          continue
        }
        const scope = scopeRepoTx.create({
          scopeId: genId('sc'),
          userId,
          tenantId,
          storeId,
          role,
          status: 'ACTIVE'
        })
        await scopeRepoTx.save(scope)
        scopeIds.push(scope.scopeId)
      }
    })

    ok(res, { userId, scopeIds }, 'Created')
  })
)

router.delete(
  '/api/v1/platform/users/:userId',
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
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'User not found', data: null })
      return
    }
    if (row.userType !== 'ADMIN') {
      res.status(400).json({ success: false, code: 40000, message: 'Only admin deletable', data: null })
      return
    }
    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(AdminScope).softDelete({ userId })
      await manager.getRepository(User).softDelete({ userId })
    })
    ok(res, { userId }, 'Deleted')
  })
)

export default router
