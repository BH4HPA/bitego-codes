import { Router } from 'express'
import { asyncHandler } from '../http/asyncHandler'
import { ok } from '../http/responses'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { getAdminContext, requireAdminContext } from '../middlewares/adminAuthz'
import { getMaintenanceState, getStoreMaintenanceState, getTenantMaintenanceState } from '../services/maintenance'

const router = Router()

router.get(
  '/api/v1/admin/maintenance',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const ctx = getAdminContext(req)
    if (!ctx) {
      res.status(500).json({ success: false, code: 50000, message: 'Missing admin context', data: null })
      return
    }
    const platform = await getMaintenanceState()
    const tenant = ctx.tenantId ? await getTenantMaintenanceState(ctx.tenantId) : { enabled: false, message: '' }
    const store = ctx.storeId ? await getStoreMaintenanceState(ctx.storeId) : { enabled: false, message: '' }
    ok(res, { platform, tenant, store }, 'OK')
  })
)

export default router
