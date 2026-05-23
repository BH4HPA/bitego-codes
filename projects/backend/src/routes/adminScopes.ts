import { Router } from 'express'
import { AppDataSource } from '../db'
import { AdminScope } from '../entities/AdminScope'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { computeCanManageSharedCatalog, getAdminContext, requireAdminContext } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'
import { Brackets, In, IsNull } from 'typeorm'

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

function getScopeLevel(role: ScopeRole) {
  if (role === 'SUPER_ADMIN') return 'PLATFORM'
  if (role === 'TENANT_ADMIN') return 'TENANT'
  return 'STORE'
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
  '/api/v1/admin/me/scopes',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = (req as any)?.user?.userId as string | undefined
    if (!userId) {
      res.status(401).json({ success: false, code: 40100, message: 'Unauthorized', data: null })
      return
    }
    const repo = AppDataSource.getRepository(AdminScope)
    const rows = await repo
      .createQueryBuilder('s')
      .where('s.deletedAt IS NULL')
      .andWhere('s.userId = :userId', { userId })
      .andWhere('s.status = :status', { status: 'ACTIVE' })
      .orderBy('s.createdAt', 'DESC')
      .getMany()

    const hasPlatform = rows.some((s) => s.role === 'SUPER_ADMIN')
    const directTenantIds = Array.from(
      new Set(rows.map((s) => s.tenantId).filter((x): x is string => typeof x === 'string' && Boolean(x.trim())))
    )
    const directStoreIds = Array.from(
      new Set(rows.map((s) => s.storeId).filter((x): x is string => typeof x === 'string' && Boolean(x.trim())))
    )
    const tenantAdminTenantIds = Array.from(
      new Set(
        rows
          .filter((s) => s.role === 'TENANT_ADMIN')
          .map((s) => s.tenantId)
          .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
      )
    )

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const storeRepo = AppDataSource.getRepository(Store)

    const tenantRows = hasPlatform
      ? await tenantRepo.createQueryBuilder('t').where('t.deletedAt IS NULL').orderBy('t.createdAt', 'DESC').getMany()
      : directTenantIds.length
        ? await tenantRepo.findBy({ tenantId: In(directTenantIds) })
        : []
    const tenantById = new Map<string, Tenant>()
    for (const t of tenantRows) if (!t.deletedAt) tenantById.set(t.tenantId, t)

    const storeRows = hasPlatform
      ? await storeRepo.createQueryBuilder('st').where('st.deletedAt IS NULL').orderBy('st.createdAt', 'DESC').getMany()
      : directStoreIds.length || tenantAdminTenantIds.length
        ? await storeRepo
            .createQueryBuilder('st')
            .where('st.deletedAt IS NULL')
            .andWhere(
              new Brackets((qb) => {
                if (directStoreIds.length) qb.orWhere('st.storeId IN (:...storeIds)', { storeIds: directStoreIds })
                if (tenantAdminTenantIds.length)
                  qb.orWhere('st.tenantId IN (:...tenantAdminTenantIds)', { tenantAdminTenantIds })
              })
            )
            .orderBy('st.createdAt', 'DESC')
            .getMany()
        : []
    const storeById = new Map<string, Store>()
    const storesByTenantId = new Map<string, Store[]>()
    for (const st of storeRows) {
      if (st.deletedAt) continue
      storeById.set(st.storeId, st)
      if (st.tenantId) {
        const arr = storesByTenantId.get(st.tenantId) || []
        arr.push(st)
        storesByTenantId.set(st.tenantId, arr)
      }
    }

    const list = rows.map((s) => {
      const tenantType = tenantById.get(s.tenantId)?.type || null
      const storeIsPrimary = s.storeId ? Number(storeById.get(s.storeId)?.isPrimary || 0) === 1 : null
      return {
        scopeId: s.scopeId,
        userId: s.userId,
        tenantId: s.tenantId,
        storeId: s.storeId,
        role: s.role,
        scopeLevel: getScopeLevel(s.role),
        tenantType,
        storeIsPrimary,
        canManageSharedCatalog: computeCanManageSharedCatalog({ role: s.role, tenantType, storeIsPrimary }),
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }
    })

    // Effective tenants/stores reachable from the current roles (for navigation).
    const tenantsMap = new Map<
      string,
      {
        tenantId: string
        tenantName: string | null
        tenantType: 'SINGLE' | 'CHAIN' | null
        effectiveRole: ScopeRole
        canManageSharedCatalog: boolean
        stores: Array<{
          storeId: string
          storeName: string | null
          storeSubName: string | null
          storeIsPrimary: boolean
          effectiveRole: ScopeRole
          canManageSharedCatalog: boolean
        }>
      }
    >()

    const upsertTenant = (tenantId: string, effectiveRole: ScopeRole) => {
      const tenant = tenantById.get(tenantId)
      if (!tenant || tenant.deletedAt) return null
      const tenantType = tenant.type
      const existing = tenantsMap.get(tenantId)
      if (existing) {
        if (roleRank(effectiveRole) > roleRank(existing.effectiveRole)) {
          existing.effectiveRole = effectiveRole
          existing.canManageSharedCatalog = computeCanManageSharedCatalog({
            role: effectiveRole,
            tenantType,
            storeIsPrimary: null
          })
        }
        return existing
      }
      const created = {
        tenantId,
        tenantName: tenant.brandName || null,
        tenantType,
        effectiveRole,
        canManageSharedCatalog: computeCanManageSharedCatalog({
          role: effectiveRole,
          tenantType,
          storeIsPrimary: null
        }),
        stores: [] as Array<{
          storeId: string
          storeName: string | null
          storeSubName: string | null
          storeIsPrimary: boolean
          effectiveRole: ScopeRole
          canManageSharedCatalog: boolean
        }>
      }
      tenantsMap.set(tenantId, created)
      return created
    }

    const addStoreToTenant = (tenantId: string, storeId: string, effectiveRole: ScopeRole) => {
      const tenantEntry = upsertTenant(tenantId, effectiveRole)
      if (!tenantEntry) return
      const store = storeById.get(storeId)
      if (!store || store.deletedAt) return
      const storeIsPrimary = Number(store.isPrimary || 0) === 1
      const existing = tenantEntry.stores.find((st) => st.storeId === storeId)
      if (existing) {
        if (roleRank(effectiveRole) > roleRank(existing.effectiveRole)) {
          existing.effectiveRole = effectiveRole
          existing.canManageSharedCatalog = computeCanManageSharedCatalog({
            role: effectiveRole,
            tenantType: tenantEntry.tenantType,
            storeIsPrimary
          })
        }
        return
      }
      tenantEntry.stores.push({
        storeId,
        storeName: store.name || null,
        storeSubName: store.subName || null,
        storeIsPrimary,
        effectiveRole,
        canManageSharedCatalog: computeCanManageSharedCatalog({
          role: effectiveRole,
          tenantType: tenantEntry.tenantType,
          storeIsPrimary
        })
      })
    }

    if (hasPlatform) {
      for (const t of tenantRows) {
        if (t.deletedAt) continue
        upsertTenant(t.tenantId, 'SUPER_ADMIN')
      }
      for (const st of storeRows) {
        if (st.deletedAt || !st.tenantId) continue
        addStoreToTenant(st.tenantId, st.storeId, 'SUPER_ADMIN')
      }
    } else {
      for (const s of rows) {
        if (s.role === 'TENANT_ADMIN') {
          upsertTenant(s.tenantId, 'TENANT_ADMIN')
          for (const st of storesByTenantId.get(s.tenantId) || []) {
            addStoreToTenant(s.tenantId, st.storeId, 'TENANT_ADMIN')
          }
        }
        if (s.role === 'STORE_ADMIN' && s.storeId) {
          addStoreToTenant(s.tenantId, s.storeId, 'STORE_ADMIN')
        }
      }
    }

    const tenants = Array.from(tenantsMap.values())
      .map((t) => ({
        ...t,
        stores: t.stores.sort((a, b) => (a.storeId > b.storeId ? 1 : a.storeId < b.storeId ? -1 : 0))
      }))
      .sort((a, b) => (a.tenantId > b.tenantId ? 1 : a.tenantId < b.tenantId ? -1 : 0))

    ok(res, {
      list,
      platform: hasPlatform ? { role: 'SUPER_ADMIN' as const } : null,
      tenants
    })
  })
)

function roleRank(role: ScopeRole): number {
  if (role === 'SUPER_ADMIN') return 3
  if (role === 'TENANT_ADMIN') return 2
  return 1
}

router.get(
  '/api/v1/admin/scopes',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    const userId = normalizeString(req.query.userId)
    if (!userId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid userId', data: null })
      return
    }
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    if (ctx.adminRole === 'STORE_ADMIN') {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    const repo = AppDataSource.getRepository(AdminScope)
    const qb = repo.createQueryBuilder('s').where('s.deletedAt IS NULL').andWhere('s.userId = :userId', { userId })
    qb.andWhere('s.status = :status', { status: 'ACTIVE' })

    if (ctx.adminRole === 'TENANT_ADMIN') {
      qb.andWhere('s.tenantId = :tenantId', { tenantId: ctx.tenantId }).andWhere('s.role = :role', {
        role: 'STORE_ADMIN'
      })
    }

    const rows = await qb.orderBy('s.createdAt', 'DESC').getMany()

    const tenantIds = Array.from(new Set(rows.map((s) => s.tenantId).filter(Boolean)))
    const storeIds = Array.from(new Set(rows.map((s) => s.storeId).filter(Boolean) as string[]))
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenants = tenantIds.length ? await tenantRepo.findBy({ tenantId: In(tenantIds) }) : []
    const tenantById = new Map<string, Tenant>()
    for (const t of tenants) if (!t.deletedAt) tenantById.set(t.tenantId, t)
    const storeRepo = AppDataSource.getRepository(Store)
    const stores = storeIds.length ? await storeRepo.findBy({ storeId: In(storeIds) }) : []
    const storeById = new Map<string, Store>()
    for (const s of stores) if (!s.deletedAt) storeById.set(s.storeId, s)

    ok(res, {
      list: rows.map((s) => {
        const tenantType = tenantById.get(s.tenantId)?.type || null
        const storeIsPrimary = s.storeId ? Number(storeById.get(s.storeId)?.isPrimary || 0) === 1 : null
        return {
          scopeId: s.scopeId,
          userId: s.userId,
          tenantId: s.tenantId,
          storeId: s.storeId,
          tenantType,
          storeIsPrimary,
          role: s.role,
          scopeLevel: getScopeLevel(s.role),
          canManageSharedCatalog: computeCanManageSharedCatalog({ role: s.role, tenantType, storeIsPrimary }),
          status: s.status,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        }
      })
    })
  })
)

router.post(
  '/api/v1/admin/scopes',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }

    const userId = normalizeString(req.body?.userId)
    const tenantId = normalizeString(req.body?.tenantId)
    const role = parseRole(req.body?.role)
    const storeId = normalizeOptionalString(req.body?.storeId)
    const statusRaw = normalizeOptionalString(req.body?.status)
    const status = statusRaw === undefined ? 'ACTIVE' : statusRaw === null ? null : statusRaw

    if (!userId || !tenantId || !role) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    if (status !== 'ACTIVE') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid status', data: null })
      return
    }

    if (role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN') {
      if (storeId !== undefined && storeId !== null) {
        res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
        return
      }
    }
    if (role === 'STORE_ADMIN' && !storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
      return
    }

    // Granting is allowed when the current role is at least as high as the granted role
    // (peer grants are permitted: a super admin may grant another super admin, etc.).
    if (roleRank(ctx.adminRole) < roleRank(role)) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    if (ctx.adminRole !== 'SUPER_ADMIN' && tenantId !== ctx.tenantId) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    if (role === 'TENANT_ADMIN' || role === 'STORE_ADMIN') {
      const okTenant = await ensureTenantExists(tenantId)
      if (!okTenant) {
        res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
        return
      }
    }

    if (role === 'STORE_ADMIN') {
      const tenantRepo = AppDataSource.getRepository(Tenant)
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
    }

    const repo = AppDataSource.getRepository(AdminScope)
    const existed = await repo.findOne({
      where: {
        userId,
        tenantId,
        storeId: role === 'STORE_ADMIN' ? (storeId as string) : IsNull(),
        role,
        status: 'ACTIVE'
      }
    })
    if (existed) {
      ok(
        res,
        {
          scopeId: existed.scopeId,
          userId: existed.userId,
          tenantId: existed.tenantId,
          storeId: existed.storeId,
          role: existed.role,
          status: existed.status,
          createdAt: existed.createdAt,
          updatedAt: existed.updatedAt
        },
        'Exists'
      )
      return
    }

    const scopeId = genId('sc')
    const row = repo.create({
      scopeId,
      userId,
      tenantId,
      storeId: role === 'STORE_ADMIN' ? (storeId as string) : null,
      role,
      status: 'ACTIVE'
    })
    await repo.save(row)
    ok(
      res,
      {
        scopeId: row.scopeId,
        userId: row.userId,
        tenantId: row.tenantId,
        storeId: row.storeId,
        role: row.role,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      },
      'Created'
    )
  })
)

router.delete(
  '/api/v1/admin/scopes/:scopeId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }

    const scopeId = String(req.params.scopeId || '').trim()
    if (!scopeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid scopeId', data: null })
      return
    }

    const repo = AppDataSource.getRepository(AdminScope)
    const row = await repo.findOne({ where: { scopeId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Scope not found', data: null })
      return
    }

    if (roleRank(ctx.adminRole) < roleRank(row.role as ScopeRole)) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    if (ctx.adminRole !== 'SUPER_ADMIN' && row.tenantId !== ctx.tenantId) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    await repo.softDelete({ scopeId })
    ok(res, { scopeId }, 'Deleted')
  })
)

export default router
