import { Router } from 'express'
import { AppDataSource } from '../db'
import { broadcastTableStatusChanged } from '../ws/adminDashboard'
import { Table } from '../entities/Table'
import { TableCart } from '../entities/TableCart'
import { TableCartItem } from '../entities/TableCartItem'
import { Order } from '../entities/Order'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { optionalAuth, requireAuth, requireAdmin } from '../middlewares/auth'
import { getActiveStoreId, requireAdminContext } from '../middlewares/adminAuthz'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { asyncHandler } from '../http/asyncHandler'
import { created, ok } from '../http/responses'
import { closeTableSession, getTableConnCount } from '../ws/tableSession'
import { genId } from '../utils/id'
import { buildStoreDisplayName } from '../utils/storeName'
import { In } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import { generateTableMiniProgramQrcode } from '../services/wechatMiniProgramQrcode'
import { generateTableH5Qrcode } from '../services/h5Qrcode'

const router = Router()

router.get(
  '/api/v1/tables',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const repo = AppDataSource.getRepository(Table)
    const storeId = getActiveStoreId(req)
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20))
    const statusQ = typeof req.query.status === 'string' ? req.query.status : ''
    const statuses = statusQ
      ? statusQ
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const where: FindOptionsWhere<Table> = { storeId }
    if (statuses.length) where.status = In(statuses)
    const [rows, total] = await repo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    ok(res, {
      list: rows.map((t) => ({
        tableId: t.tableId,
        code: t.code,
        status: t.status,
        sessionVersion: t.sessionVersion,
        qrcodeUrl: t.qrcodeUrl || null,
        h5QrcodeUrl: t.h5QrcodeUrl || null
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.post(
  '/api/v1/tables',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { code, status = 'FREE' } = req.body || {}
    if (!code || typeof code !== 'string') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid code', data: null })
      return
    }
    const repo = AppDataSource.getRepository(Table)
    const tableId = genId('tbl')
    const row = repo.create({
      tableId,
      storeId: getActiveStoreId(req),
      code,
      status,
      sessionVersion: 1,
      sessionClosedAt: null,
      qrcodeUrl: null,
      h5QrcodeUrl: null
    })
    await repo.save(row)
    if (config.wechatMiniProgram.appId && config.wechatMiniProgram.secret) {
      try {
        const { publicUrl } = await generateTableMiniProgramQrcode({ tableId })
        row.qrcodeUrl = publicUrl
        await repo.save(row)
      } catch (e: unknown) {
        const err = e as Record<string, unknown>
        process.stderr.write(
          `${JSON.stringify({
            ts: new Date().toISOString(),
            type: 'TABLE_QRCODE_CREATE_ERROR',
            tableId,
            message: String(err?.message || (e instanceof Error ? e.message : e)),
            name: typeof err?.name === 'string' ? err.name : e instanceof Error ? e.name : undefined,
            stack: e instanceof Error ? e.stack : undefined,
            envVersion: config.wechatMiniProgram.envVersion,
            qrcodePagePath: config.wechatMiniProgram.qrcodePagePath
          })}\n`
        )
        try {
          await repo.delete({ tableId })
        } catch {}
        res.status(500).json({ success: false, code: 50000, message: 'Create table qrcode failed', data: null })
        return
      }
    } else {
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          type: 'TABLE_QRCODE_SKIPPED',
          tableId,
          reason: 'WECHAT_CREDENTIALS_NOT_CONFIGURED',
          hasAppId: Boolean(config.wechatMiniProgram.appId),
          hasSecret: Boolean(config.wechatMiniProgram.secret),
          envVersion: config.wechatMiniProgram.envVersion,
          qrcodePagePath: config.wechatMiniProgram.qrcodePagePath
        })}\n`
      )
    }

    if (config.h5AppDomain && config.cos.bucket && config.cos.region) {
      try {
        const { publicUrl } = await generateTableH5Qrcode({ tableId })
        row.h5QrcodeUrl = publicUrl
        await repo.save(row)
      } catch (e: unknown) {
        const err = e as Record<string, unknown>
        process.stderr.write(
          `${JSON.stringify({
            ts: new Date().toISOString(),
            type: 'TABLE_H5_QRCODE_CREATE_ERROR',
            tableId,
            message: String(err?.message || (e instanceof Error ? e.message : e)),
            name: typeof err?.name === 'string' ? err.name : e instanceof Error ? e.name : undefined,
            stack: e instanceof Error ? e.stack : undefined,
            h5AppDomain: config.h5AppDomain
          })}\n`
        )
        try {
          await repo.delete({ tableId })
        } catch {}
        res.status(500).json({ success: false, code: 50000, message: 'Create table h5 qrcode failed', data: null })
        return
      }
    } else {
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          type: 'TABLE_H5_QRCODE_SKIPPED',
          tableId,
          reason: !config.h5AppDomain ? 'H5APP_DOMAIN_NOT_CONFIGURED' : 'COS_BUCKET_REGION_NOT_CONFIGURED',
          hasH5AppDomain: Boolean(config.h5AppDomain),
          hasCosBucket: Boolean(config.cos.bucket),
          hasCosRegion: Boolean(config.cos.region)
        })}\n`
      )
    }

    created(res, { tableId, qrcodeUrl: row.qrcodeUrl, h5QrcodeUrl: row.h5QrcodeUrl }, 'Created')
  })
)

router.post(
  '/api/v1/tables/:tableId/qrcode',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { tableId } = req.params
    const repo = AppDataSource.getRepository(Table)
    const storeRepo = AppDataSource.getRepository(Store)
    const row = await repo.findOne({ where: { tableId, storeId: getActiveStoreId(req) } })
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'Table not found', data: null })
      return
    }

    const envVersionRaw = req.body?.envVersion
    const envVersion = envVersionRaw === undefined ? undefined : String(envVersionRaw)
    if (envVersion !== undefined && envVersion !== 'release' && envVersion !== 'trial' && envVersion !== 'develop') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid envVersion', data: null })
      return
    }

    if (!config.wechatMiniProgram.appId || !config.wechatMiniProgram.secret) {
      res.status(409).json({ success: false, code: 40910, message: 'WeChat credentials not configured', data: null })
      return
    }

    const usedEnvVersion = (envVersion || config.wechatMiniProgram.envVersion) as 'release' | 'trial' | 'develop'
    try {
      const { publicUrl } = await generateTableMiniProgramQrcode({ tableId, envVersion: usedEnvVersion })
      row.qrcodeUrl = publicUrl
      await repo.save(row)
      ok(res, { tableId, qrcodeUrl: row.qrcodeUrl, envVersion: usedEnvVersion }, 'Updated')
    } catch (e: unknown) {
      const err = e as Record<string, unknown>
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          type: 'TABLE_QRCODE_REGENERATE_ERROR',
          tableId,
          message: String(err?.message || (e instanceof Error ? e.message : e)),
          name: typeof err?.name === 'string' ? err.name : e instanceof Error ? e.name : undefined,
          stack: e instanceof Error ? e.stack : undefined,
          envVersion: usedEnvVersion,
          qrcodePagePath: config.wechatMiniProgram.qrcodePagePath
        })}\n`
      )
      res.status(500).json({ success: false, code: 50000, message: 'Regenerate table qrcode failed', data: null })
    }
  })
)

router.post(
  '/api/v1/tables/:tableId/h5-qrcode',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { tableId } = req.params
    const repo = AppDataSource.getRepository(Table)
    const row = await repo.findOne({ where: { tableId, storeId: getActiveStoreId(req) } })
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'Table not found', data: null })
      return
    }

    if (!config.h5AppDomain) {
      res.status(409).json({ success: false, code: 40910, message: 'H5 domain not configured', data: null })
      return
    }
    if (!config.cos.bucket || !config.cos.region) {
      res.status(409).json({ success: false, code: 40910, message: 'COS bucket/region not configured', data: null })
      return
    }

    try {
      const { publicUrl } = await generateTableH5Qrcode({ tableId })
      row.h5QrcodeUrl = publicUrl
      await repo.save(row)
      ok(res, { tableId, h5QrcodeUrl: row.h5QrcodeUrl }, 'Updated')
    } catch (e: unknown) {
      const err = e as Record<string, unknown>
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          type: 'TABLE_H5_QRCODE_REGENERATE_ERROR',
          tableId,
          message: String(err?.message || (e instanceof Error ? e.message : e)),
          name: typeof err?.name === 'string' ? err.name : e instanceof Error ? e.name : undefined,
          stack: e instanceof Error ? e.stack : undefined,
          h5AppDomain: config.h5AppDomain
        })}\n`
      )
      res.status(500).json({ success: false, code: 50000, message: 'Regenerate table h5 qrcode failed', data: null })
    }
  })
)

router.put(
  '/api/v1/tables/:tableId',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { tableId } = req.params
    const repo = AppDataSource.getRepository(Table)
    const storeRepo = AppDataSource.getRepository(Store)
    const row = await repo.findOne({ where: { tableId, storeId: getActiveStoreId(req) } })
    if (!row) {
      res.status(404).json({ success: false, code: 40400, message: 'Table not found', data: null })
      return
    }
    const prevStatus = row.status
    const { code, status } = req.body || {}
    if (code !== undefined) row.code = code
    if (status !== undefined) row.status = status
    await repo.save(row)
    if (status !== undefined && prevStatus !== row.status) {
      const store = await storeRepo.findOne({ where: { storeId: row.storeId } })
      broadcastTableStatusChanged({
        tableId: row.tableId,
        storeId: row.storeId,
        tenantId: store?.tenantId || null,
        status: row.status
      })
    }
    ok(res, { tableId }, 'Updated')
  })
)

router.get(
  '/api/v1/tables/:tableId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { tableId } = req.params
    const repo = AppDataSource.getRepository(Table)
    const orderRepo = AppDataSource.getRepository(Order)
    const storeRepo = AppDataSource.getRepository(Store)
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const t = await repo.findOne({ where: { tableId } })
    if (!t) {
      res.status(404).json({ success: false, code: 40400, message: 'Table not found', data: null })
      return
    }
    const store = await storeRepo.findOne({ where: { storeId: t.storeId } })
    const tenant = store?.tenantId ? await tenantRepo.findOne({ where: { tenantId: store.tenantId } }) : null
    const tenantBrandName = tenant?.brandName || null
    const wasFree = t.status === 'FREE'
    if (t.status === 'FREE') {
      t.status = 'OCCUPIED'
      t.sessionClosedAt = null
      await repo.save(t)
      broadcastTableStatusChanged({
        tableId: t.tableId,
        storeId: t.storeId,
        tenantId: store?.tenantId || null,
        status: 'OCCUPIED'
      })
    }
    const sessionToken = jwt.sign({ tableId: t.tableId, sessionVersion: t.sessionVersion }, config.jwtSecret, {
      noTimestamp: true
    })
    const connCount = getTableConnCount(tableId)
    const activeStatuses = ['Created', 'Paid', 'Making']
    const activeOrderCount = wasFree
      ? 0
      : await orderRepo.count({ where: { tableId, tableSessionVersion: t.sessionVersion, status: In(activeStatuses) } })
    ok(res, {
      tableId: t.tableId,
      code: t.code,
      status: t.status,
      sessionVersion: t.sessionVersion,
      sessionToken,
      qrcodeUrl: t.qrcodeUrl || null,
      h5QrcodeUrl: t.h5QrcodeUrl || null,
      storeId: t.storeId,
      store: store
        ? {
            storeId: store.storeId,
            tenantId: store.tenantId,
            tenantType: tenant?.type || null,
            tenantBrandName,
            subName: store.subName,
            name: store.name,
            displayName: buildStoreDisplayName(tenant, store),
            logoUrl: store.logoUrl,
            phone: store.phone,
            address: store.address,
            description: store.description
          }
        : null,
      wasFree,
      connCount,
      activeOrderCount
    })
  })
)

router.post(
  '/api/v1/tables/:tableId/reset-session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { tableId } = req.params
    const repo = AppDataSource.getRepository(Table)
    const orderRepo = AppDataSource.getRepository(Order)
    const cartRepo = AppDataSource.getRepository(TableCart)
    const cartItemRepo = AppDataSource.getRepository(TableCartItem)
    const storeRepo = AppDataSource.getRepository(Store)
    const t = await repo.findOne({ where: { tableId } })
    if (!t) {
      res.status(404).json({ success: false, code: 40400, message: 'Table not found', data: null })
      return
    }
    const store = await storeRepo.findOne({ where: { storeId: t.storeId } })
    const connCount = getTableConnCount(tableId)
    if (connCount > 0) {
      res.status(409).json({ success: false, code: 40900, message: 'Table has online users', data: null })
      return
    }
    const activeStatuses = ['Created', 'Paid', 'Making']
    const activeCount = await orderRepo.count({
      where: { tableId, tableSessionVersion: t.sessionVersion, status: In(activeStatuses) }
    })
    if (activeCount > 0) {
      res.status(409).json({ success: false, code: 40900, message: 'Table has active orders', data: null })
      return
    }
    t.status = 'FREE'
    t.sessionVersion = (t.sessionVersion || 1) + 1
    t.sessionClosedAt = new Date()
    await repo.save(t)
    broadcastTableStatusChanged({
      tableId: t.tableId,
      storeId: t.storeId,
      tenantId: store?.tenantId || null,
      status: 'FREE'
    })
    const carts = await cartRepo.find({ where: { tableId, sessionVersion: t.sessionVersion - 1 } })
    for (const cart of carts) {
      await cartItemRepo.delete({ cartId: cart.cartId })
      await cartRepo.delete({ id: cart.id })
    }
    closeTableSession(tableId)
    ok(res, { tableId: t.tableId, status: t.status, sessionVersion: t.sessionVersion }, 'Cleared')
  })
)

router.post(
  '/api/v1/tables/:tableId/clear',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { tableId } = req.params
    const repo = AppDataSource.getRepository(Table)
    const orderRepo = AppDataSource.getRepository(Order)
    const cartRepo = AppDataSource.getRepository(TableCart)
    const cartItemRepo = AppDataSource.getRepository(TableCartItem)
    const storeRepo = AppDataSource.getRepository(Store)
    const t = await repo.findOne({ where: { tableId, storeId: getActiveStoreId(req) } })
    if (!t) {
      res.status(404).json({ success: false, code: 40400, message: 'Table not found', data: null })
      return
    }
    const store = await storeRepo.findOne({ where: { storeId: t.storeId } })
    const activeStatuses = ['Created', 'Paid', 'Making']
    const activeCount = await orderRepo.count({
      where: { tableId, tableSessionVersion: t.sessionVersion, status: In(activeStatuses) }
    })
    if (activeCount > 0) {
      res.status(409).json({ success: false, code: 40900, message: 'Table has active orders', data: null })
      return
    }
    t.status = 'FREE'
    t.sessionVersion = (t.sessionVersion || 1) + 1
    t.sessionClosedAt = new Date()
    await repo.save(t)
    broadcastTableStatusChanged({
      tableId: t.tableId,
      storeId: t.storeId,
      tenantId: store?.tenantId || null,
      status: 'FREE'
    })
    const carts = await cartRepo.find({ where: { tableId, sessionVersion: t.sessionVersion - 1 } })
    for (const cart of carts) {
      await cartItemRepo.delete({ cartId: cart.cartId })
      await cartRepo.delete({ id: cart.id })
    }
    closeTableSession(tableId)
    ok(res, { tableId: t.tableId, status: t.status, sessionVersion: t.sessionVersion }, 'Cleared')
  })
)

router.post(
  '/api/v1/tables/:tableId/force-clear',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { tableId } = req.params
    const repo = AppDataSource.getRepository(Table)
    const cartRepo = AppDataSource.getRepository(TableCart)
    const cartItemRepo = AppDataSource.getRepository(TableCartItem)
    const storeRepo = AppDataSource.getRepository(Store)
    const t = await repo.findOne({ where: { tableId, storeId: getActiveStoreId(req) } })
    if (!t) {
      res.status(404).json({ success: false, code: 40400, message: 'Table not found', data: null })
      return
    }
    const store = await storeRepo.findOne({ where: { storeId: t.storeId } })
    t.status = 'FREE'
    t.sessionVersion = (t.sessionVersion || 1) + 1
    t.sessionClosedAt = new Date()
    await repo.save(t)
    broadcastTableStatusChanged({
      tableId: t.tableId,
      storeId: t.storeId,
      tenantId: store?.tenantId || null,
      status: 'FREE'
    })
    const carts = await cartRepo.find({ where: { tableId, sessionVersion: t.sessionVersion - 1 } })
    for (const cart of carts) {
      await cartItemRepo.delete({ cartId: cart.cartId })
      await cartRepo.delete({ id: cart.id })
    }
    closeTableSession(tableId)
    ok(res, { tableId: t.tableId, status: t.status, sessionVersion: t.sessionVersion }, 'Cleared')
  })
)

export default router
