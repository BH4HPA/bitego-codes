import { Router } from 'express'
import { AppDataSource } from '../db'
import { PlatformConfig } from '../entities/PlatformConfig'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAdmin, requireAuth } from '../middlewares/auth'
import { requireAdminContext, requireAdminRole } from '../middlewares/adminAuthz'

const router = Router()

router.get(
  '/api/v1/platform/branding',
  asyncHandler(async (_req, res) => {
    const repo = AppDataSource.getRepository(PlatformConfig)
    const row = await repo.findOne({ where: { configId: 'platform_default' } })
    ok(res, {
      platformName: row?.platformName || 'BiteGo 点点餐',
      platformLogoUrl: row?.platformLogoUrl || null
    })
  })
)

router.put(
  '/api/v1/platform/branding',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  requireAdminRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { platformName, platformLogoUrl } = req.body || {}
    if (platformName !== undefined && (typeof platformName !== 'string' || !platformName.trim())) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid platformName', data: null })
      return
    }
    if (platformLogoUrl !== undefined && platformLogoUrl !== null && typeof platformLogoUrl !== 'string') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid platformLogoUrl', data: null })
      return
    }

    const repo = AppDataSource.getRepository(PlatformConfig)
    const row =
      (await repo.findOne({ where: { configId: 'platform_default' } })) ||
      repo.create({ configId: 'platform_default', platformName: 'BiteGo 点点餐', platformLogoUrl: null })
    if (platformName !== undefined) row.platformName = String(platformName).trim()
    if (platformLogoUrl !== undefined) row.platformLogoUrl = platformLogoUrl ? String(platformLogoUrl) : null
    await repo.save(row)
    ok(res, { platformName: row.platformName, platformLogoUrl: row.platformLogoUrl || null }, 'Updated')
  })
)

export default router
