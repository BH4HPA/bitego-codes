import { Request, Response, NextFunction } from 'express'
import { AppDataSource } from '../db'
import { getAuthUser } from './auth'
import { badRequest } from '../http/errors'
import { AdminScope } from '../entities/AdminScope'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'

export type AdminRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STORE_ADMIN'
export type AdminBoard = 'platform' | 'tenant' | 'store'

export type AdminContext = {
  adminRole: AdminRole
  tenantId: string
  storeId: string | null
  board: AdminBoard
  tenantType: 'CHAIN' | 'SINGLE' | null
  storeIsPrimary: boolean | null
  canManageSharedCatalog: boolean
}

const ROLE_RANK: Record<AdminRole, number> = {
  STORE_ADMIN: 1,
  TENANT_ADMIN: 2,
  SUPER_ADMIN: 3
}

export const PLATFORM_TENANT_SENTINEL = 'store_default'

function setAdminContext(req: Request, ctx: AdminContext) {
  ;(req as Request & { adminCtx?: AdminContext }).adminCtx = ctx
}

export function getAdminContext(req: Request): AdminContext | null {
  return (req as Request & { adminCtx?: AdminContext }).adminCtx || null
}

export function getActiveStoreId(req: Request): string {
  const ctx = getAdminContext(req)
  if (!ctx?.storeId) throw badRequest('Missing store context')
  return ctx.storeId
}

export function computeCanManageSharedCatalog(params: {
  role: AdminRole
  tenantType: 'CHAIN' | 'SINGLE' | null
  storeIsPrimary: boolean | null
}): boolean {
  // Shared-catalog rows are keyed by storeId; writing from a CHAIN branch context would
  // modify the branch-local copy and bypass the primary→branch sync change log. Block the
  // capability here regardless of role — callers must switch to the tenant board or the
  // primary store context to edit shared catalog.
  if (params.tenantType === 'CHAIN' && params.storeIsPrimary === false) return false
  if (params.role === 'SUPER_ADMIN' || params.role === 'TENANT_ADMIN') return true
  if (params.role === 'STORE_ADMIN') {
    if (params.tenantType === 'SINGLE') return true
    if (params.tenantType === 'CHAIN' && params.storeIsPrimary === true) return true
  }
  return false
}

function normalizeHeader(v: unknown): string | null {
  if (typeof v === 'string' && v) return v
  return null
}

export async function requireAdminContext(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any)?.user?.userId as string | undefined
  if (!userId) {
    res.status(401).json({ success: false, code: 40100, message: 'Unauthorized', data: null })
    return
  }

  const tenantIdHeader = normalizeHeader(req.headers['x-tenant-id'])
  const storeIdHeader = normalizeHeader(req.headers['x-store-id'])
  const boardHeader = normalizeHeader(req.headers['x-board'])
  const board: AdminBoard | null =
    boardHeader === 'platform' || boardHeader === 'tenant' || boardHeader === 'store' ? boardHeader : null

  const repo = AppDataSource.getRepository(AdminScope)
  const scopes = await repo
    .createQueryBuilder('s')
    .where('s.deletedAt IS NULL')
    .andWhere('s.userId = :userId', { userId })
    .andWhere('s.status = :status', { status: 'ACTIVE' })
    .orderBy('s.createdAt', 'DESC')
    .getMany()

  if (!scopes.length) {
    res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
    return
  }

  const hasSuper = scopes.some((s) => s.role === 'SUPER_ADMIN')

  // 平台作用域快速路径：SUPER_ADMIN 且未带租户/门店头
  if (hasSuper && !tenantIdHeader && !storeIdHeader) {
    if (board && board !== 'platform') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid admin context', data: null })
      return
    }
    setAdminContext(req, {
      adminRole: 'SUPER_ADMIN',
      tenantId: PLATFORM_TENANT_SENTINEL,
      storeId: null,
      board: 'platform',
      tenantType: null,
      storeIsPrimary: null,
      canManageSharedCatalog: true
    })
    next()
    return
  }

  const storeRepo = AppDataSource.getRepository(Store)
  const tenantRepo = AppDataSource.getRepository(Tenant)

  if (storeIdHeader) {
    if (board && board !== 'store') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid admin context', data: null })
      return
    }
    const store = await storeRepo.findOne({ where: { storeId: storeIdHeader } })
    if (!store || !store.tenantId) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }
    const tenantId = tenantIdHeader || store.tenantId
    if (tenantIdHeader && tenantIdHeader !== store.tenantId) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }

    const role: AdminRole | null = hasSuper
      ? 'SUPER_ADMIN'
      : scopes.some((s) => s.role === 'TENANT_ADMIN' && s.tenantId === tenantId)
        ? 'TENANT_ADMIN'
        : scopes.some((s) => s.role === 'STORE_ADMIN' && s.storeId === storeIdHeader)
          ? 'STORE_ADMIN'
          : null
    if (!role) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const tenant = await tenantRepo.findOne({ where: { tenantId } })
    const tenantType = tenant && !tenant.deletedAt ? tenant.type : null
    const storeIsPrimary = Number(store.isPrimary || 0) === 1
    setAdminContext(req, {
      adminRole: role,
      tenantId,
      storeId: storeIdHeader,
      board: 'store',
      tenantType,
      storeIsPrimary,
      canManageSharedCatalog: computeCanManageSharedCatalog({ role, tenantType, storeIsPrimary })
    })
    next()
    return
  }

  if (tenantIdHeader) {
    if (board && board !== 'tenant') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid admin context', data: null })
      return
    }
    const role: AdminRole | null = hasSuper
      ? 'SUPER_ADMIN'
      : scopes.some((s) => s.role === 'TENANT_ADMIN' && s.tenantId === tenantIdHeader)
        ? 'TENANT_ADMIN'
        : null
    if (!role) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const tenant = await tenantRepo.findOne({ where: { tenantId: tenantIdHeader } })
    const tenantType = tenant && !tenant.deletedAt ? tenant.type : null
    setAdminContext(req, {
      adminRole: role,
      tenantId: tenantIdHeader,
      storeId: null,
      board: 'tenant',
      tenantType,
      storeIsPrimary: null,
      canManageSharedCatalog: computeCanManageSharedCatalog({ role, tenantType, storeIsPrimary: null })
    })
    next()
    return
  }

  if (board === 'platform' && hasSuper) {
    setAdminContext(req, {
      adminRole: 'SUPER_ADMIN',
      tenantId: PLATFORM_TENANT_SENTINEL,
      storeId: null,
      board: 'platform',
      tenantType: null,
      storeIsPrimary: null,
      canManageSharedCatalog: true
    })
    next()
    return
  }

  res.status(400).json({ success: false, code: 40000, message: 'Missing admin context', data: null })
}

export async function requireAdminContextIfAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getAuthUser(req)
  if (!user || user.role !== 'ADMIN') {
    next()
    return
  }
  await requireAdminContext(req, res, next)
}

export function requireAdminRole(minRole: AdminRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    if (ROLE_RANK[ctx.adminRole] < ROLE_RANK[minRole]) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    next()
  }
}

export function requireCatalogWrite() {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(400).json({ success: false, code: 40000, message: 'Missing context', data: null })
      return
    }
    if (!ctx.canManageSharedCatalog) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    next()
  }
}
