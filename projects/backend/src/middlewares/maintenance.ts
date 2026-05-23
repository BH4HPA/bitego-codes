import { Request, Response, NextFunction } from 'express'
import { getMaintenanceState, getStoreMaintenanceState, getTenantMaintenanceState } from '../services/maintenance'

function isAllowedPath(path: string) {
  if (path === '/health') return true
  if (path.startsWith('/api/v1/auth/')) return true
  if (path === '/api/v1/admin/maintenance') return true
  if (path === '/api/v1/stores/export') return true
  if (path === '/api/v1/stores/import') return true
  if (path === '/api/v1/stores/reset') return true
  if (path === '/api/v1/platform/snapshot/export') return true
  if (path === '/api/v1/platform/snapshot/import') return true
  if (path === '/api/v1/platform/snapshot/reset') return true
  if (path === '/api/v1/tenant/snapshot/export') return true
  if (path === '/api/v1/tenant/snapshot/import') return true
  if (path === '/api/v1/tenant/snapshot/reset') return true
  return false
}

function normalizeHeader(v: unknown) {
  if (!v) return ''
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v).trim()
}

function isWriteMethod(method: string) {
  const m = String(method || '').toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

export async function maintenanceGuard(req: Request, res: Response, next: NextFunction) {
  const state = await getMaintenanceState()
  if (state.enabled) {
    if (isAllowedPath(req.path)) return next()
    res.status(503).json({ success: false, code: 50300, message: state.message, data: null })
    return
  }

  if (!isWriteMethod(req.method)) return next()
  if (isAllowedPath(req.path)) return next()

  const tenantId = normalizeHeader(req.headers['x-tenant-id'])
  const storeId = normalizeHeader(req.headers['x-store-id'])
  if (storeId) {
    const s = await getStoreMaintenanceState(storeId)
    if (s.enabled) {
      res.status(503).json({ success: false, code: 50300, message: s.message, data: null })
      return
    }
  }
  if (tenantId) {
    const t = await getTenantMaintenanceState(tenantId)
    if (t.enabled) {
      res.status(503).json({ success: false, code: 50300, message: t.message, data: null })
      return
    }
  }

  next()
}
