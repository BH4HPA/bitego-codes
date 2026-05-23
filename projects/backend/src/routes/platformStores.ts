import { Router } from 'express'
import { AppDataSource } from '../db'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'
import { genId } from '../utils/id'
import { buildStoreDisplayName } from '../utils/storeName'
import { In } from 'typeorm'

const router = Router()

function normalizeString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function getStoreType(tenantType: string | null, isPrimary: number) {
  if (tenantType === 'SINGLE') return 'SINGLE_STORE'
  if (tenantType === 'CHAIN') return isPrimary === 1 ? 'CHAIN_PRIMARY' : 'CHAIN_BRANCH'
  return null
}

router.get(
  '/api/v1/platform/stores',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId.trim() : ''
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : ''
    const page = Math.max(1, Number(req.query.page || 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) || 20))

    const repo = AppDataSource.getRepository(Store)
    const qb = repo.createQueryBuilder('s').where('s.deletedAt IS NULL')
    if (tenantId) qb.andWhere('s.tenantId = :tenantId', { tenantId })
    if (keyword) qb.andWhere('(s.storeId LIKE :kw OR s.name LIKE :kw OR s.subName LIKE :kw)', { kw: `%${keyword}%` })

    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    const [rows, total] = await qb.getManyAndCount()
    const tenantIds = Array.from(
      new Set(rows.map((s) => s.tenantId).filter((x): x is string => typeof x === 'string' && Boolean(x.trim())))
    )
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenants = tenantIds.length ? await tenantRepo.findBy({ tenantId: In(tenantIds) }) : []
    const tenantById = new Map<string, Tenant>()
    for (const t of tenants) if (!t.deletedAt) tenantById.set(t.tenantId, t)
    ok(res, {
      list: rows.flatMap((s) => {
        const tenant = s.tenantId ? tenantById.get(s.tenantId) : undefined
        if (tenant?.type === 'SINGLE' && tenant.primaryStoreId && tenant.primaryStoreId !== s.storeId) {
          if (s.storeId === tenant.tenantId) return []
        }
        return [
          {
            tenantType: tenant?.type || null,
            tenantBrandName: tenant?.brandName || '',
            storeType: getStoreType(tenant?.type || null, s.isPrimary),
            storeId: s.storeId,
            tenantId: s.tenantId,
            isPrimary: s.isPrimary,
            subName: s.subName,
            name: s.name,
            displayName: buildStoreDisplayName(tenant, s),
            logoUrl: s.logoUrl,
            phone: s.phone,
            address: s.address,
            description: s.description,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
          }
        ]
      }),
      pagination: { page, pageSize, total }
    })
  })
)

router.get(
  '/api/v1/platform/stores/:storeId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const storeId = String(req.params.storeId || '').trim()
    if (!storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Store)
    const row = await repo.findOne({ where: { storeId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenant = row.tenantId ? await tenantRepo.findOne({ where: { tenantId: row.tenantId } }) : null
    const tenantType = tenant && !tenant.deletedAt ? tenant.type : null
    const tenantBrandName = tenant && !tenant.deletedAt ? tenant.brandName : ''

    ok(res, {
      tenantType,
      tenantBrandName,
      storeType: getStoreType(tenantType, row.isPrimary),
      storeId: row.storeId,
      tenantId: row.tenantId,
      isPrimary: row.isPrimary,
      subName: row.subName,
      name: row.name,
      displayName: buildStoreDisplayName(tenant, row),
      logoUrl: row.logoUrl,
      phone: row.phone,
      address: row.address,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })
  })
)

router.post(
  '/api/v1/platform/stores',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const tenantId = normalizeString(req.body?.tenantId)
    const name = normalizeString(req.body?.name)
    const storeIdInput = normalizeString(req.body?.storeId)
    const storeId = storeIdInput || genId('store')

    if (!tenantId || !name) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }

    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenant = await tenantRepo.findOne({ where: { tenantId } })
    if (!tenant || tenant.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Store)
    if (tenant.type === 'SINGLE') {
      const existedCount = await repo
        .createQueryBuilder('s')
        .where('s.deletedAt IS NULL')
        .andWhere('s.tenantId = :tenantId', { tenantId })
        .getCount()
      if (existedCount > 0) {
        res
          .status(400)
          .json({ success: false, code: 40000, message: 'SINGLE tenant cannot have multiple stores', data: null })
        return
      }
    }
    const existed = await repo.findOne({ where: { storeId } })
    if (existed && !existed.deletedAt) {
      res.status(400).json({ success: false, code: 40000, message: 'Store already exists', data: null })
      return
    }

    const isPrimaryRaw = req.body?.isPrimary
    const isPrimary =
      tenant.type === 'SINGLE' ? 1 : isPrimaryRaw === 1 || isPrimaryRaw === '1' || isPrimaryRaw === true ? 1 : 0

    const subName = normalizeString(req.body?.subName)
    const bodyLogoUrl = typeof req.body?.logoUrl === 'string' ? req.body.logoUrl : ''
    // Chain tenants: store logo always mirrors the brand logo, not editable per store.
    const logoUrl = tenant.type === 'CHAIN' ? tenant.brandLogoUrl || '' : bodyLogoUrl
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : ''
    const address = typeof req.body?.address === 'string' ? req.body.address : ''
    const description = typeof req.body?.description === 'string' ? req.body.description : ''

    await AppDataSource.transaction(async (manager) => {
      const storeRepo = manager.getRepository(Store)
      const tenantRepo = manager.getRepository(Tenant)
      if (isPrimary) {
        await storeRepo
          .createQueryBuilder()
          .update(Store)
          .set({ isPrimary: 0 })
          .where('tenantId = :tenantId', { tenantId })
          .execute()
      }

      const row = storeRepo.create({
        storeId,
        tenantId,
        isPrimary,
        subName: subName || null,
        name,
        logoUrl,
        phone,
        address,
        description
      })
      await storeRepo.save(row)
      if (isPrimary) {
        tenant.primaryStoreId = storeId
        await tenantRepo.save(tenant)
      }
    })

    ok(res, { storeId }, 'Created')
  })
)

router.put(
  '/api/v1/platform/stores/:storeId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const storeId = String(req.params.storeId || '').trim()
    if (!storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Store)
    const row = await repo.findOne({ where: { storeId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }

    const name = req.body?.name !== undefined ? normalizeString(req.body?.name) : undefined
    if (name === null) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid name', data: null })
      return
    }
    const subName = req.body?.subName !== undefined ? normalizeString(req.body?.subName) : undefined
    const isPrimaryRaw = req.body?.isPrimary
    const isPrimary = isPrimaryRaw === 1 || isPrimaryRaw === '1' || isPrimaryRaw === true ? 1 : 0
    const patchPrimary = req.body?.isPrimary !== undefined

    const logoUrl = req.body?.logoUrl !== undefined ? String(req.body.logoUrl || '') : undefined
    const phone = req.body?.phone !== undefined ? String(req.body.phone || '') : undefined
    const address = req.body?.address !== undefined ? String(req.body.address || '') : undefined
    const description = req.body?.description !== undefined ? String(req.body.description || '') : undefined

    if (logoUrl !== undefined && row.tenantId) {
      const tenantRepo = AppDataSource.getRepository(Tenant)
      const tenant = await tenantRepo.findOne({ where: { tenantId: row.tenantId } })
      if (tenant && !tenant.deletedAt && tenant.type === 'CHAIN' && logoUrl !== (tenant.brandLogoUrl || '')) {
        res.status(403).json({
          success: false,
          code: 40300,
          message: 'Chain tenant store logo is managed by brand logo',
          data: null
        })
        return
      }
    }

    await AppDataSource.transaction(async (manager) => {
      const storeRepo = manager.getRepository(Store)
      const tenantRepo = manager.getRepository(Tenant)
      const tenantId = row.tenantId || null

      if (name !== undefined) row.name = name
      if (subName !== undefined) row.subName = subName
      if (logoUrl !== undefined) row.logoUrl = logoUrl
      if (phone !== undefined) row.phone = phone
      if (address !== undefined) row.address = address
      if (description !== undefined) row.description = description

      let tenant = tenantId ? await tenantRepo.findOne({ where: { tenantId } }) : null
      if (tenant?.deletedAt) tenant = null

      if (patchPrimary && tenantId) {
        if (tenant && tenant.type === 'SINGLE') {
          row.isPrimary = 1
          if (tenant.primaryStoreId !== row.storeId) {
            tenant.primaryStoreId = row.storeId
            await tenantRepo.save(tenant)
          }
        } else if (isPrimary) {
          await storeRepo
            .createQueryBuilder()
            .update(Store)
            .set({ isPrimary: 0 })
            .where('tenantId = :tenantId', { tenantId })
            .execute()
          row.isPrimary = 1
          if (tenant) {
            tenant.primaryStoreId = row.storeId
            await tenantRepo.save(tenant)
          }
        } else {
          row.isPrimary = 0
        }
      }

      await storeRepo.save(row)

      // 单店租户：门店是权威，门店改名时同步 tenant.brandName。
      if (name !== undefined && tenant && tenant.type === 'SINGLE' && tenant.brandName !== row.name) {
        tenant.brandName = row.name
        await tenantRepo.save(tenant)
      }
    })

    ok(res, { storeId }, 'Updated')
  })
)

router.delete(
  '/api/v1/platform/stores/:storeId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const storeId = String(req.params.storeId || '').trim()
    if (!storeId) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid storeId', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Store)
    const row = await repo.findOne({ where: { storeId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Store not found', data: null })
      return
    }

    await AppDataSource.transaction(async (manager) => {
      const storeRepo = manager.getRepository(Store)
      const tenantRepo = manager.getRepository(Tenant)
      if (row.tenantId) {
        const tenant = await tenantRepo.findOne({ where: { tenantId: row.tenantId } })
        if (tenant && !tenant.deletedAt && tenant.primaryStoreId === storeId) {
          tenant.primaryStoreId = null
          await tenantRepo.save(tenant)
        }
      }
      await storeRepo.softDelete({ storeId })
    })

    ok(res, { storeId }, 'Deleted')
  })
)

export default router
