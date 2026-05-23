import { Router } from 'express'
import { AppDataSource } from '../db'
import { Tenant } from '../entities/Tenant'
import { Store } from '../entities/Store'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { getAdminContext, requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'

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
  '/api/v1/tenant/branding',
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

    const repo = AppDataSource.getRepository(Tenant)
    const row = await repo.findOne({ where: { tenantId: ctx.tenantId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    ok(res, {
      tenantId: row.tenantId,
      type: row.type,
      status: row.status,
      brandName: row.brandName,
      brandLogoUrl: row.brandLogoUrl,
      primaryStoreId: row.primaryStoreId,
      updatedAt: row.updatedAt
    })
  })
)

router.put(
  '/api/v1/tenant/branding',
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

    const brandName = req.body?.brandName !== undefined ? normalizeString(req.body?.brandName) : undefined
    if (brandName === null) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid brandName', data: null })
      return
    }
    const brandLogoUrl =
      req.body?.brandLogoUrl !== undefined ? normalizeOptionalString(req.body?.brandLogoUrl) : undefined
    if (brandLogoUrl !== undefined && brandLogoUrl !== null && brandLogoUrl.length > 500) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid brandLogoUrl', data: null })
      return
    }
    if (brandName === undefined && brandLogoUrl === undefined) {
      res.status(400).json({ success: false, code: 40000, message: 'No fields to update', data: null })
      return
    }

    const repo = AppDataSource.getRepository(Tenant)
    const row = await repo.findOne({ where: { tenantId: ctx.tenantId } })
    if (!row || row.deletedAt) {
      res.status(404).json({ success: false, code: 40400, message: 'Tenant not found', data: null })
      return
    }

    await AppDataSource.transaction(async (manager) => {
      const tenantRepoTx = manager.getRepository(Tenant)
      const storeRepoTx = manager.getRepository(Store)

      if (brandName !== undefined) row.brandName = brandName
      if (brandLogoUrl !== undefined) row.brandLogoUrl = brandLogoUrl
      await tenantRepoTx.save(row)

      // Chain tenants: propagate brand logo to every store's logoUrl so the two
      // stay in lockstep without requiring a read-time join.
      if (row.type === 'CHAIN' && brandLogoUrl !== undefined) {
        await storeRepoTx
          .createQueryBuilder()
          .update(Store)
          .set({ logoUrl: row.brandLogoUrl || '' })
          .where('tenantId = :tenantId AND deletedAt IS NULL', { tenantId: row.tenantId })
          .execute()
      }

      // 单店租户：品牌名就是门店名，同步到 primary 门店（门店仍是概念上的权威方，
      // 但从品牌入口改名时我们不报错，保持两边一致即可）。
      if (row.type === 'SINGLE' && brandName !== undefined && row.primaryStoreId) {
        const primary = await storeRepoTx.findOne({ where: { storeId: row.primaryStoreId } })
        if (primary && !primary.deletedAt && primary.name !== row.brandName) {
          primary.name = row.brandName
          await storeRepoTx.save(primary)
        }
      }
    })

    ok(res, { tenantId: row.tenantId, brandName: row.brandName, brandLogoUrl: row.brandLogoUrl }, 'Updated')
  })
)

export default router
