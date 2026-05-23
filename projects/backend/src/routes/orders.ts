import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { AppDataSource } from '../db'
import { Order } from '../entities/Order'
import { OrderItem } from '../entities/OrderItem'
import { Table } from '../entities/Table'
import { TableCart } from '../entities/TableCart'
import { TableCartItem } from '../entities/TableCartItem'
import { PaymentTransaction } from '../entities/PaymentTransaction'
import { RefundTransaction } from '../entities/RefundTransaction'
import { SKU } from '../entities/SKU'
import { Good } from '../entities/Good'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { config } from '../config'
import { genId } from '../utils/id'
import { buildStoreDisplayName } from '../utils/storeName'
import { asyncHandler } from '../http/asyncHandler'
import { accepted, created, ok } from '../http/responses'
import { Between, In, LessThanOrEqual, Like, MoreThanOrEqual } from 'typeorm'
import { getAuthUser } from '../middlewares/auth'
import { emitCartUpdated, emitToTable } from '../ws/tableSession'
import { requireIdempotency } from '../middlewares/idempotency'
import { withRedisLock } from '../redis'
import type { FindOptionsOrder, FindOptionsWhere } from 'typeorm'
import { nowShanghaiCompact } from '../utils/time'
import { Notification } from '../entities/Notification'
import { emitAdminNotification } from '../ws/notificationBus'
import { User } from '../entities/User'
import { requireAdminContext, requireAdminContextIfAdmin, getActiveStoreId } from '../middlewares/adminAuthz'
import { Store } from '../entities/Store'
import { Tenant } from '../entities/Tenant'
import { recordOrderStatusLog } from '../services/orderStatusLogService'
import { OrderStatusLog } from '../entities/OrderStatusLog'

const router = Router()

function parseDateOrNull(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('\t')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: any[], headers: string[], getter: (r: any, key: string) => unknown): string {
  const bom = '\ufeff'
  const lines = [headers.map(csvEscape).join(',')]
  for (const r of rows) {
    lines.push(headers.map((k) => csvEscape(getter(r, k))).join(','))
  }
  return bom + lines.join('\n')
}

function toTsvForExcel(rows: any[], headers: string[], getter: (r: any, key: string) => unknown): string {
  const bom = '\ufeff'
  const lines = [headers.map((h) => (h ? String(h) : '')).join('\t')]
  for (const r of rows) {
    lines.push(
      headers
        .map((k) => {
          const v = getter(r, k)
          return v === null || v === undefined ? '' : String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
        })
        .join('\t')
    )
  }
  return bom + lines.join('\n')
}

router.get(
  '/api/v1/orders',
  requireAuth,
  requireAdminContextIfAdmin,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const orderItemRepo = AppDataSource.getRepository(OrderItem)
    const userRepo = AppDataSource.getRepository(User)
    const storeRepo = AppDataSource.getRepository(Store)
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20))
    const statusQ = typeof req.query.status === 'string' ? req.query.status : ''
    const statuses = statusQ
      ? statusQ
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const tableId = typeof req.query.tableId === 'string' ? req.query.tableId : undefined
    const orderNoQ = typeof req.query.orderNo === 'string' ? req.query.orderNo.trim() : ''
    const createdAtFrom = parseDateOrNull(req.query.createdAtFrom)
    const createdAtTo = parseDateOrNull(req.query.createdAtTo)
    if (req.query.createdAtFrom !== undefined && !createdAtFrom) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid createdAtFrom', data: null })
      return
    }
    if (req.query.createdAtTo !== undefined && !createdAtTo) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid createdAtTo', data: null })
      return
    }
    const tableSessionVersionRaw =
      typeof req.query.tableSessionVersion === 'string' ? req.query.tableSessionVersion : undefined
    const tableSessionVersion = tableSessionVersionRaw ? parseInt(tableSessionVersionRaw, 10) : undefined
    const sessionToken = typeof req.query.sessionToken === 'string' ? req.query.sessionToken : undefined
    const where: FindOptionsWhere<Order> = {}
    if (statuses.length) where.status = In(statuses)
    if (tableId) where.tableId = tableId
    if (orderNoQ) where.orderNo = Like(`%${orderNoQ.replace(/[\\%_]/g, '\\$&')}%`)
    if (tableSessionVersion && Number.isFinite(tableSessionVersion)) where.tableSessionVersion = tableSessionVersion
    if (createdAtFrom && createdAtTo) where.createdAt = Between(createdAtFrom, createdAtTo)
    else if (createdAtFrom) where.createdAt = MoreThanOrEqual(createdAtFrom)
    else if (createdAtTo) where.createdAt = LessThanOrEqual(createdAtTo)
    if (user?.role === 'ADMIN') {
      const storeId = getActiveStoreId(req)
      where.storeId = storeId
    } else {
      let allowTableSessionView = false
      if (sessionToken && tableId && tableSessionVersion && Number.isFinite(tableSessionVersion)) {
        try {
          const payload: any = jwt.verify(sessionToken, config.jwtSecret)
          allowTableSessionView = payload?.tableId === tableId && payload?.sessionVersion === tableSessionVersion
        } catch {
          allowTableSessionView = false
        }
      }
      if (!allowTableSessionView) where.userId = user?.userId
    }
    const order: FindOptionsOrder<Order> = { id: 'DESC' }
    const [rows, total] = await orderRepo.findAndCount({ where, order, skip: (page - 1) * pageSize, take: pageSize })

    const orderIds = rows.map((o) => o.orderId)
    const qtyAggRows = orderIds.length
      ? await orderItemRepo
          .createQueryBuilder('i')
          .select('i.orderId', 'orderId')
          .addSelect('SUM(i.qty)', 'totalQty')
          .where('i.orderId IN (:...orderIds)', { orderIds })
          .groupBy('i.orderId')
          .getRawMany()
      : []
    const totalQtyByOrderId = new Map<string, number>()
    for (const r of qtyAggRows as any[]) {
      totalQtyByOrderId.set(String(r.orderId), parseInt(String(r.totalQty || '0'), 10) || 0)
    }

    const tableRepo = AppDataSource.getRepository(Table)
    const tableIds = Array.from(new Set(rows.map((o) => o.tableId).filter((x) => typeof x === 'string' && x)))
    const tableRows = tableIds.length ? await tableRepo.find({ where: { tableId: In(tableIds) } }) : []
    const tableCodeById = new Map<string, string>()
    for (const t of tableRows) tableCodeById.set(t.tableId, t.code)

    const payerUserIds = Array.from(new Set(rows.map((o) => o.userId).filter((x) => typeof x === 'string' && x)))
    const payerRows = payerUserIds.length ? await userRepo.find({ where: { userId: In(payerUserIds) } }) : []
    const payerById = new Map<string, { nickname: string; avatarUrl: string }>()
    for (const u of payerRows) payerById.set(u.userId, { nickname: u.nickname || '', avatarUrl: u.avatarUrl || '' })

    const storeIds = Array.from(new Set(rows.map((o) => o.storeId).filter((x) => typeof x === 'string' && x)))
    const storeRows = storeIds.length ? await storeRepo.find({ where: { storeId: In(storeIds) } }) : []
    const storeById = new Map<
      string,
      { tenantId: string | null; name: string; subName: string | null; logoUrl: string }
    >()
    for (const s of storeRows)
      storeById.set(s.storeId, {
        tenantId: s.tenantId || null,
        name: s.name || '',
        subName: s.subName || null,
        logoUrl: s.logoUrl || ''
      })

    const tenantIds = Array.from(new Set(storeRows.map((s) => s.tenantId).filter((x) => typeof x === 'string' && x)))
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenantRows = tenantIds.length ? await tenantRepo.find({ where: { tenantId: In(tenantIds) } }) : []
    const tenantById = new Map<string, { type: string | null; brandName: string }>()
    for (const t of tenantRows) tenantById.set(t.tenantId, { type: t.type || null, brandName: t.brandName || '' })
    const resolveDisplayName = (storeId: string) => {
      const s = storeById.get(storeId)
      if (!s) return null
      const tenant = s.tenantId ? tenantById.get(s.tenantId) : undefined
      return buildStoreDisplayName(tenant || null, s)
    }

    ok(res, {
      list: rows.map((o) => ({
        orderId: o.orderId,
        orderNo: o.orderNo,
        status: o.status,
        storeId: user?.role === 'ADMIN' ? null : o.storeId,
        tenantId: user?.role === 'ADMIN' ? null : storeById.get(o.storeId)?.tenantId || null,
        tenantBrandName:
          user?.role === 'ADMIN'
            ? null
            : (storeById.get(o.storeId)?.tenantId
                ? tenantById.get(storeById.get(o.storeId)?.tenantId || '')?.brandName
                : null) || null,
        storeSubName: user?.role === 'ADMIN' ? null : storeById.get(o.storeId)?.subName || null,
        storeName: user?.role === 'ADMIN' ? null : storeById.get(o.storeId)?.name || null,
        storeDisplayName: user?.role === 'ADMIN' ? null : resolveDisplayName(o.storeId),
        storeLogoUrl: user?.role === 'ADMIN' ? null : storeById.get(o.storeId)?.logoUrl || null,
        tableId: o.tableId,
        tableSessionVersion: o.tableSessionVersion,
        tableCode: tableCodeById.get(o.tableId) || null,
        payerUserId: o.userId,
        payerNickname: payerById.get(o.userId)?.nickname || null,
        payerAvatarUrl: payerById.get(o.userId)?.avatarUrl || null,
        totalAmount: o.totalAmount,
        totalAmountCents: Number(String(o.totalAmount || '0')),
        totalQty: totalQtyByOrderId.get(o.orderId) || 0,
        remark: o.remark,
        paidAt: o.paidAt,
        createdAt: o.createdAt,
        completedAt: o.completedAt,
        canceledAt: o.canceledAt,
        refundedAt: o.refundedAt
      })),
      pagination: { page, pageSize, total }
    })
  })
)

router.get(
  '/api/v1/orders/export',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const format = typeof req.query.format === 'string' ? req.query.format.trim() : 'csv'
    if (format !== 'csv' && format !== 'xls') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid format', data: null })
      return
    }

    const orderRepo = AppDataSource.getRepository(Order)
    const orderItemRepo = AppDataSource.getRepository(OrderItem)
    const userRepo = AppDataSource.getRepository(User)
    const storeId = getActiveStoreId(req)

    const statusQ = typeof req.query.status === 'string' ? req.query.status : ''
    const statuses = statusQ
      ? statusQ
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const tableId = typeof req.query.tableId === 'string' ? req.query.tableId : undefined
    const orderNoQ = typeof req.query.orderNo === 'string' ? req.query.orderNo.trim() : ''
    const createdAtFrom = parseDateOrNull(req.query.createdAtFrom)
    const createdAtTo = parseDateOrNull(req.query.createdAtTo)
    if (req.query.createdAtFrom !== undefined && !createdAtFrom) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid createdAtFrom', data: null })
      return
    }
    if (req.query.createdAtTo !== undefined && !createdAtTo) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid createdAtTo', data: null })
      return
    }

    const where: FindOptionsWhere<Order> = { storeId }
    if (statuses.length) where.status = In(statuses)
    if (tableId) where.tableId = tableId
    if (orderNoQ) where.orderNo = Like(`%${orderNoQ.replace(/[\\%_]/g, '\\$&')}%`)
    if (createdAtFrom && createdAtTo) where.createdAt = Between(createdAtFrom, createdAtTo)
    else if (createdAtFrom) where.createdAt = MoreThanOrEqual(createdAtFrom)
    else if (createdAtTo) where.createdAt = LessThanOrEqual(createdAtTo)

    const rows = await orderRepo.find({ where, order: { id: 'DESC' }, take: 10000 })
    const orderIds = rows.map((o) => o.orderId)
    const qtyAggRows = orderIds.length
      ? await orderItemRepo
          .createQueryBuilder('i')
          .select('i.orderId', 'orderId')
          .addSelect('SUM(i.qty)', 'totalQty')
          .where('i.orderId IN (:...orderIds)', { orderIds })
          .groupBy('i.orderId')
          .getRawMany()
      : []
    const totalQtyByOrderId = new Map<string, number>()
    for (const r of qtyAggRows as any[]) {
      totalQtyByOrderId.set(String(r.orderId), parseInt(String(r.totalQty || '0'), 10) || 0)
    }

    const tableRepo = AppDataSource.getRepository(Table)
    const tableIds = Array.from(new Set(rows.map((o) => o.tableId).filter((x) => typeof x === 'string' && x)))
    const tableRows = tableIds.length ? await tableRepo.find({ where: { tableId: In(tableIds) } }) : []
    const tableCodeById = new Map<string, string>()
    for (const t of tableRows) tableCodeById.set(t.tableId, t.code)

    const payerUserIds = Array.from(new Set(rows.map((o) => o.userId).filter((x) => typeof x === 'string' && x)))
    const payerRows = payerUserIds.length ? await userRepo.find({ where: { userId: In(payerUserIds) } }) : []
    const payerById = new Map<string, { nickname: string }>()
    for (const u of payerRows) payerById.set(u.userId, { nickname: u.nickname || '' })

    const dataRows = rows.map((o) => ({
      orderNo: o.orderNo,
      status: o.status,
      tableCode: tableCodeById.get(o.tableId) || '',
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
      paidAt: o.paidAt ? new Date(o.paidAt).toISOString() : '',
      totalAmountCents: o.totalAmount ? String(o.totalAmount) : '0',
      totalQty: totalQtyByOrderId.get(o.orderId) || 0,
      payerNickname: payerById.get(o.userId)?.nickname || ''
    }))
    const headers = [
      'orderNo',
      'status',
      'tableCode',
      'createdAt',
      'paidAt',
      'totalAmountCents',
      'totalQty',
      'payerNickname'
    ]

    const content =
      format === 'csv' ? toCsv(dataRows, headers, (r, k) => r[k]) : toTsvForExcel(dataRows, headers, (r, k) => r[k])
    const ts = nowShanghaiCompact()
    const filename = format === 'csv' ? `orders_${ts}.csv` : `orders_${ts}.xls`
    res.setHeader(
      'Content-Type',
      format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.ms-excel; charset=utf-8'
    )
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(content)
  })
)

router.post(
  '/api/v1/orders',
  requireAuth,
  requireIdempotency(),
  asyncHandler(async (req, res) => {
    const { tableId, cartVersion, remark, paymentMethod } = req.body || {}
    if (!tableId || typeof cartVersion !== 'number') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid params', data: null })
      return
    }
    const auth = getAuthUser(req)
    const userId = auth?.userId || 'usr_guest'
    const now = new Date()

    const locked = await withRedisLock(`order:${tableId}`, 5000, async () => {
      return await AppDataSource.manager.transaction(async (em) => {
        const tableRepo = em.getRepository(Table)
        const cartRepo = em.getRepository(TableCart)
        const cartItemRepo = em.getRepository(TableCartItem)
        const skuRepo = em.getRepository(SKU)
        const goodRepo = em.getRepository(Good)
        const orderRepo = em.getRepository(Order)
        const orderItemRepo = em.getRepository(OrderItem)
        const payRepo = em.getRepository(PaymentTransaction)

        const t = await tableRepo.findOne({ where: { tableId } })
        if (!t) {
          return { ok: false as const, httpStatus: 404, code: 40400, message: 'Table not found' }
        }

        const carts = await cartRepo.find({
          where: { tableId, sessionVersion: t.sessionVersion },
          order: { id: 'DESC' },
          take: 1
        })
        const cart = carts[0]
        if (!cart || cart.version !== cartVersion) {
          return { ok: false as const, httpStatus: 400, code: 40001, message: 'Cart version mismatch' }
        }

        const cartItems = await cartItemRepo.find({ where: { cartId: cart.cartId } })
        if (!cartItems.length) {
          return { ok: false as const, httpStatus: 400, code: 40000, message: 'Cart empty' }
        }

        const skuIds = Array.from(new Set(cartItems.map((it) => it.skuId))).sort()
        const skus = await skuRepo.find({
          where: { skuId: In(skuIds) },
          lock: { mode: 'pessimistic_write' }
        })
        const skuById = new Map<string, SKU>()
        for (const s of skus) skuById.set(s.skuId, s)
        if (skus.length !== skuIds.length) {
          return { ok: false as const, httpStatus: 400, code: 40001, message: 'SKU not available' }
        }

        const goodIds = Array.from(new Set(skus.map((s) => s.goodId)))
        const goods = await goodRepo.find({ where: { goodId: In(goodIds) } })
        const goodById = new Map<string, Good>()
        for (const g of goods) goodById.set(g.goodId, g)

        let totalCents = 0n
        const qtyBySkuId = new Map<string, number>()
        for (const it of cartItems) {
          const sku = skuById.get(it.skuId)!
          if (sku.status !== 'ON_SHELF')
            return { ok: false as const, httpStatus: 400, code: 40001, message: 'SKU not available' }
          const nextQty = (qtyBySkuId.get(it.skuId) || 0) + it.qty
          qtyBySkuId.set(it.skuId, nextQty)
          totalCents += BigInt(String(it.unitPriceSnapshot || sku.price || '0')) * BigInt(it.qty)
        }

        const qtyByGoodId = new Map<string, number>()
        for (const it of cartItems) {
          const sku = skuById.get(it.skuId)!
          qtyByGoodId.set(sku.goodId, (qtyByGoodId.get(sku.goodId) || 0) + it.qty)
        }

        for (const [skuId, qty] of qtyBySkuId.entries()) {
          const sku = skuById.get(skuId)!
          if (sku.stock < qty) return { ok: false as const, httpStatus: 400, code: 40001, message: 'Out of stock' }
          sku.stock = sku.stock - qty
          await skuRepo.save(sku)
        }

        const orderId = genId('ord')
        const orderNo = `${nowShanghaiCompact()}${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, '0')}`
        const order = orderRepo.create({
          orderId,
          orderNo,
          storeId: t.storeId,
          tableId,
          tableSessionVersion: t.sessionVersion,
          userId,
          status: 'Paid',
          paymentMethod: paymentMethod || 'WECHAT',
          remark: remark || null,
          totalAmount: totalCents.toString(),
          paidAmount: totalCents.toString(),
          refundedAmount: null,
          paidAt: now,
          completedAt: null,
          canceledAt: null,
          refundedAt: null
        })
        await orderRepo.save(order)
        await recordOrderStatusLog({
          manager: em,
          orderId,
          storeId: order.storeId,
          fromStatus: null,
          toStatus: order.status,
          reason: null,
          remark: 'Order created',
          changedByUserId: userId || null,
          changedByUserRole: auth?.role || null
        })

        for (const it of cartItems) {
          const sku = skuById.get(it.skuId)!
          const good = goodById.get(sku.goodId)
          const oi: any = {
            orderItemId: genId('oi'),
            orderId,
            skuId: sku.skuId,
            goodNameSnapshot: good?.name || it.goodNameSnapshot,
            specTextSnapshot: it.specTextSnapshot,
            unitPriceSnapshot: it.unitPriceSnapshot,
            qty: it.qty,
            servedQty: 0,
            priceItemKey: it.priceItemKey || null,
            nonStockSelectionsSnapshot: it.nonStockSelectionsSnapshot || null,
            priceItemSnapshot: it.priceItemSnapshot || null,
            addedByUserId: it.addedByUserId,
            addedByNicknameSnapshot: it.addedByNicknameSnapshot,
            addedByAvatarSnapshot: it.addedByAvatarSnapshot
          }
          await orderItemRepo.insert(oi)
        }

        for (const [goodId, qty] of qtyByGoodId.entries()) {
          if (!qty) continue
          await goodRepo
            .createQueryBuilder()
            .update(Good)
            .set({ sales: () => `sales + ${qty}` })
            .where('goodId = :goodId', { goodId })
            .execute()
        }

        const payment = payRepo.create({
          paymentId: genId('pay'),
          orderId,
          paymentMethod: order.paymentMethod || 'WECHAT',
          amount: order.paidAmount || '0',
          status: 'SUCCESS',
          requestedAt: now,
          succeededAt: now
        })
        await payRepo.save(payment)

        await cartItemRepo.delete({ cartId: cart.cartId })
        cart.version = cart.version + 1
        await cartRepo.save(cart)

        return {
          ok: true as const,
          orderId,
          orderNo,
          paidAt: now,
          paymentId: payment.paymentId,
          totalAmountCents: totalCents.toString(),
          tableCode: t.code,
          remark: remark || null,
          cartId: cart.cartId,
          cartOpenedAt: cart.openedAt,
          cartVersion: cart.version
        }
      })
    })

    if (!locked) {
      res.status(429).json({ success: false, code: 42900, message: 'Too Many Requests', data: null })
      return
    }
    const result = locked

    if (!result.ok) {
      res.status(result.httpStatus).json({ success: false, code: result.code, message: result.message, data: null })
      return
    }
    emitToTable(tableId, 'ORDER_CREATED', {
      orderId: result.orderId,
      orderNo: result.orderNo,
      status: 'Paid',
      tableId,
      payerUserId: userId,
      payerNickname: auth?.nickname || ''
    })
    emitCartUpdated(tableId, {
      cartId: result.cartId,
      openedAt: result.cartOpenedAt,
      items: [],
      version: result.cartVersion
    })
    try {
      const tableRepo = AppDataSource.getRepository(Table)
      const storeRepo = AppDataSource.getRepository(Store)
      const table = await tableRepo.findOne({ where: { tableId } })
      const storeId = table?.storeId || null
      const tenantId = storeId ? (await storeRepo.findOne({ where: { storeId } }))?.tenantId || null : null
      const repo = AppDataSource.getRepository(Notification)
      const n = repo.create({
        notificationId: genId('ntf'),
        type: 'ORDER_CREATED',
        title: '新订单',
        message: `${result.tableCode || '桌台'} 下单`,
        orderId: result.orderId,
        tableId,
        tableCode: result.tableCode || null,
        tenantId,
        storeId,
        status: 'UNREAD',
        readAt: null,
        handledAt: null,
        payload: {
          orderId: result.orderId,
          orderNo: result.orderNo,
          tableId,
          tableCode: result.tableCode || null,
          totalAmountCents: result.totalAmountCents,
          remark: result.remark
        }
      })
      await repo.save(n)
      emitAdminNotification({ notificationId: n.notificationId })
    } catch (err) {
      console.error('[orders] failed to persist ORDER_CREATED notification', {
        orderId: result.orderId,
        tableId,
        err: err instanceof Error ? err.message : String(err)
      })
    }
    created(
      res,
      {
        orderId: result.orderId,
        orderNo: result.orderNo,
        status: 'Paid',
        paidAt: result.paidAt,
        paymentId: result.paymentId
      },
      'Order created successfully.'
    )
  })
)

router.get(
  '/api/v1/orders/:orderId',
  requireAuth,
  requireAdminContextIfAdmin,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const user = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const orderItemRepo = AppDataSource.getRepository(OrderItem)
    const userRepo = AppDataSource.getRepository(User)
    const storeRepo = AppDataSource.getRepository(Store)
    const sessionToken = typeof req.query.sessionToken === 'string' ? req.query.sessionToken : undefined
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    if (user?.role === 'ADMIN') {
      const storeId = getActiveStoreId(req)
      if (order.storeId !== storeId) {
        res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
        return
      }
    }
    if (user?.role !== 'ADMIN' && order.userId !== user?.userId) {
      let allowTableSessionView = false
      if (sessionToken && order.tableId && order.tableSessionVersion && Number.isFinite(order.tableSessionVersion)) {
        try {
          const payload: any = jwt.verify(sessionToken, config.jwtSecret)
          allowTableSessionView =
            payload?.tableId === order.tableId && payload?.sessionVersion === order.tableSessionVersion
        } catch {
          allowTableSessionView = false
        }
      }
      if (!allowTableSessionView) {
        res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
        return
      }
    }
    const tableRepo = AppDataSource.getRepository(Table)
    const table = order.tableId ? await tableRepo.findOne({ where: { tableId: order.tableId } }) : null
    const items = await orderItemRepo.find({ where: { orderId } })
    const payer = order.userId ? await userRepo.findOne({ where: { userId: order.userId } }) : null
    const store = user?.role === 'ADMIN' ? null : await storeRepo.findOne({ where: { storeId: order.storeId } })
    const tenantRepo = AppDataSource.getRepository(Tenant)
    const tenant = store?.tenantId ? await tenantRepo.findOne({ where: { tenantId: store.tenantId } }) : null
    const tenantBrandName = tenant?.brandName || null
    const storeDisplayName = store ? buildStoreDisplayName(tenant, store) : null
    ok(res, {
      orderId: order.orderId,
      orderNo: order.orderNo,
      status: order.status,
      storeId: user?.role === 'ADMIN' ? null : order.storeId,
      tenantId: user?.role === 'ADMIN' ? null : store?.tenantId || null,
      tenantBrandName: user?.role === 'ADMIN' ? null : tenantBrandName,
      storeSubName: user?.role === 'ADMIN' ? null : store?.subName || null,
      storeName: user?.role === 'ADMIN' ? null : store?.name || null,
      storeDisplayName: user?.role === 'ADMIN' ? null : storeDisplayName,
      storeLogoUrl: user?.role === 'ADMIN' ? null : store?.logoUrl || null,
      tableId: order.tableId,
      tableCode: table?.code || null,
      payerUserId: order.userId,
      payerNickname: payer?.nickname || null,
      payerAvatarUrl: payer?.avatarUrl || null,
      totalAmount: order.totalAmount,
      totalAmountCents: Number(String(order.totalAmount || '0')),
      remark: order.remark,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      completedAt: order.completedAt,
      canceledAt: order.canceledAt,
      refundedAt: order.refundedAt,
      items: items.map((it) => ({
        orderItemId: it.orderItemId,
        goodNameSnapshot: it.goodNameSnapshot,
        specTextSnapshot: it.specTextSnapshot,
        unitPriceSnapshot: it.unitPriceSnapshot,
        unitPriceSnapshotCents: Number(String(it.unitPriceSnapshot || '0')),
        qty: it.qty,
        servedQty: it.servedQty,
        addedByNicknameSnapshot: it.addedByNicknameSnapshot,
        addedByAvatarSnapshot: it.addedByAvatarSnapshot
      }))
    })
  })
)

router.get(
  '/api/v1/orders/:orderId/export',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const format = typeof req.query.format === 'string' ? req.query.format.trim() : 'csv'
    if (format !== 'csv' && format !== 'xls') {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid format', data: null })
      return
    }

    const orderRepo = AppDataSource.getRepository(Order)
    const orderItemRepo = AppDataSource.getRepository(OrderItem)
    const storeId = getActiveStoreId(req)
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order || order.storeId !== storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    const items = await orderItemRepo.find({ where: { orderId }, order: { id: 'ASC' } as any, take: 500 })
    const rows = items.map((it) => {
      const unit = Number(String(it.unitPriceSnapshot || '0'))
      return {
        orderNo: order.orderNo,
        goodName: it.goodNameSnapshot,
        spec: it.specTextSnapshot,
        skuId: it.skuId,
        unitPriceCents: unit,
        qty: it.qty,
        subtotalCents: unit * it.qty
      }
    })
    const headers = ['orderNo', 'goodName', 'spec', 'skuId', 'unitPriceCents', 'qty', 'subtotalCents']
    const content =
      format === 'csv' ? toCsv(rows, headers, (r, k) => r[k]) : toTsvForExcel(rows, headers, (r, k) => r[k])
    const filename = format === 'csv' ? `order_${order.orderNo}.csv` : `order_${order.orderNo}.xls`
    res.setHeader(
      'Content-Type',
      format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.ms-excel; charset=utf-8'
    )
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(content)
  })
)

router.get(
  '/api/v1/orders/:orderId/status-logs',
  requireAuth,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const user = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const logRepo = AppDataSource.getRepository(OrderStatusLog)
    const userRepo = AppDataSource.getRepository(User)
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    if (user?.role === 'ADMIN') {
      const storeId = getActiveStoreId(req)
      if (order.storeId !== storeId) {
        res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
        return
      }
    } else if (order.userId !== user?.userId) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const rows = await logRepo.find({ where: { orderId }, order: { id: 'ASC' } as any, take: 200 })
    const actorIds = Array.from(new Set(rows.map((r) => r.changedByUserId).filter(Boolean)))
    const actors = actorIds.length ? await userRepo.find({ where: { userId: In(actorIds) } }) : []
    const actorById = new Map<string, { nickname: string; avatarUrl: string }>()
    for (const a of actors) actorById.set(a.userId, { nickname: a.nickname || '', avatarUrl: a.avatarUrl || '' })
    ok(res, {
      list: rows.map((r) => ({
        logId: r.logId,
        orderId: r.orderId,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        reason: r.reason,
        remark: r.remark,
        changedByUserId: r.changedByUserId,
        changedByUserRole: r.changedByUserRole,
        changedByNickname: r.changedByUserId ? actorById.get(r.changedByUserId)?.nickname || null : null,
        changedByAvatarUrl: r.changedByUserId ? actorById.get(r.changedByUserId)?.avatarUrl || null : null,
        createdAt: r.createdAt
      }))
    })
  })
)

router.put(
  '/api/v1/orders/:orderId/status',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const { status, reason, remark } = req.body || {}
    const admin = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    const storeId = getActiveStoreId(req)
    if (order.storeId !== storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    if (!['Making', 'Completed', 'Canceled'].includes(status)) {
      res.status(400).json({ success: false, code: 40001, message: 'Invalid status', data: null })
      return
    }
    const prevStatus = order.status
    order.status = status
    if (status === 'Completed') order.completedAt = new Date()
    if (status === 'Canceled') order.canceledAt = new Date()
    await AppDataSource.manager.transaction(async (em) => {
      await em.getRepository(Order).save(order)
      if (prevStatus !== order.status) {
        await recordOrderStatusLog({
          manager: em,
          orderId: order.orderId,
          storeId: order.storeId,
          fromStatus: prevStatus || null,
          toStatus: order.status,
          reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
          remark: typeof remark === 'string' && remark.trim() ? remark.trim() : null,
          changedByUserId: admin?.userId || null,
          changedByUserRole: 'ADMIN'
        })
      }
    })
    if (status === 'Canceled' && prevStatus !== 'Canceled' && prevStatus !== 'Refunded') {
      const orderItemRepo = AppDataSource.getRepository(OrderItem)
      const skuRepo = AppDataSource.getRepository(SKU)
      const goodRepo = AppDataSource.getRepository(Good)
      const items = await orderItemRepo.find({ where: { orderId } })
      const skuIds = Array.from(new Set(items.map((x) => x.skuId).filter(Boolean)))
      const skus = skuIds.length ? await skuRepo.find({ where: { skuId: In(skuIds) } }) : []
      const skuById = new Map<string, SKU>()
      for (const s of skus) skuById.set(s.skuId, s)
      const goodQty = new Map<string, number>()
      for (const it of items) {
        const sku = skuById.get(it.skuId)
        if (!sku) continue
        goodQty.set(sku.goodId, (goodQty.get(sku.goodId) || 0) + it.qty)
      }
      for (const [goodId, qty] of goodQty.entries()) {
        if (!qty) continue
        await goodRepo
          .createQueryBuilder()
          .update(Good)
          .set({ sales: () => `GREATEST(sales - ${qty}, 0)` })
          .where('goodId = :goodId', { goodId })
          .execute()
      }
    }
    if (order.tableId) emitToTable(order.tableId, 'ORDER_STATUS_CHANGED', { orderId, status: order.status })
    ok(res, { orderId, status: order.status }, 'Status updated.')
  })
)

router.post(
  '/api/v1/orders/:orderId/items/:orderItemId/serve',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { orderId, orderItemId } = req.params
    const { mode, qty } = req.body || {}
    const admin = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const orderItemRepo = AppDataSource.getRepository(OrderItem)
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    const storeId = getActiveStoreId(req)
    if (order.storeId !== storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    if (['Canceled', 'Refunded', 'Completed'].includes(order.status)) {
      res.status(400).json({ success: false, code: 40001, message: 'Order not servable', data: null })
      return
    }
    const item = await orderItemRepo.findOne({ where: { orderItemId, orderId } })
    if (!item) {
      res.status(404).json({ success: false, code: 40400, message: 'Order item not found', data: null })
      return
    }
    if (mode === 'SET_ALL') {
      item.servedQty = item.qty
    } else {
      const inc = typeof qty === 'number' && qty > 0 ? qty : 1
      item.servedQty = Math.min(item.qty, item.servedQty + inc)
    }
    await AppDataSource.manager.transaction(async (em) => {
      const orderRepoTx = em.getRepository(Order)
      const orderItemRepoTx = em.getRepository(OrderItem)
      await orderItemRepoTx.save(item)

      const prevStatus = order.status
      const allItems = await orderItemRepoTx.find({ where: { orderId } })
      if (prevStatus === 'Paid' && item.servedQty > 0) order.status = 'Making'
      if (allItems.every((it) => it.servedQty >= it.qty)) {
        order.status = 'Completed'
        order.completedAt = new Date()
      }
      if (order.status !== prevStatus) {
        await orderRepoTx.save(order)
        await recordOrderStatusLog({
          manager: em,
          orderId: order.orderId,
          storeId: order.storeId,
          fromStatus: prevStatus || null,
          toStatus: order.status,
          reason: null,
          remark: null,
          changedByUserId: admin?.userId || null,
          changedByUserRole: 'ADMIN'
        })
      }
    })
    if (order.tableId) {
      emitToTable(order.tableId, 'ORDER_ITEM_SERVED', { orderId, orderItemId, servedQty: item.servedQty })
      emitToTable(order.tableId, 'ORDER_STATUS_CHANGED', { orderId, status: order.status })
    }
    ok(res, { orderId, orderItemId, servedQty: item.servedQty, orderStatus: order.status }, 'Served.')
  })
)

router.post(
  '/api/v1/orders/:orderId/refunds',
  requireAuth,
  requireIdempotency(),
  requireAdminContextIfAdmin,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const { reason } = req.body || {}
    const user = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const refundRepo = AppDataSource.getRepository(RefundTransaction)
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    if (user?.role === 'ADMIN') {
      const storeId = getActiveStoreId(req)
      if (order.storeId !== storeId) {
        res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
        return
      }
    }
    if (user?.role !== 'ADMIN' && order.userId !== user?.userId) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const refunds = await refundRepo.find({ where: { orderId }, order: { id: 'DESC' }, take: 20 })
    const activeRefund = refunds.find((r) => r.status === 'REVIEWING' || r.status === 'PENDING') || null
    const succeededRefund = refunds.find((r) => r.status === 'SUCCESS') || null

    if (order.status === 'Refunded') {
      if (succeededRefund) {
        ok(res, { orderId, refundId: succeededRefund.refundId, status: succeededRefund.status }, 'Refunded')
        return
      }
      res.status(400).json({ success: false, code: 40003, message: 'Refund not allowed', data: null })
      return
    }
    if (order.status !== 'Paid' && order.status !== 'Refunding') {
      res.status(400).json({ success: false, code: 40003, message: 'Refund not allowed', data: null })
      return
    }
    if (activeRefund) {
      if (activeRefund.status === 'PENDING') {
        const etaMs = parseInt(process.env.REFUND_ETA_MS || '10000', 10)
        const requestedAtMs = activeRefund.requestedAt ? new Date(activeRefund.requestedAt).getTime() : Date.now()
        const etaSeconds = Math.max(0, Math.ceil((requestedAtMs + etaMs - Date.now()) / 1000))
        accepted(
          res,
          { orderId, refundId: activeRefund.refundId, status: activeRefund.status, etaSeconds },
          'Refund requested.'
        )
        return
      }
      accepted(res, { orderId, refundId: activeRefund.refundId, status: activeRefund.status }, 'Refund requested.')
      return
    }

    const refund = refundRepo.create({
      refundId: genId('ref'),
      orderId,
      amount: order.paidAmount || order.totalAmount,
      status: 'REVIEWING',
      reason: reason || null,
      requestedAt: new Date(),
      reviewedAt: null,
      reviewedByUserId: null,
      reviewRejectReason: null,
      succeededAt: null
    })
    await refundRepo.save(refund)
    if (order.status === 'Paid') {
      const prevStatus = order.status
      order.status = 'Refunding'
      await AppDataSource.manager.transaction(async (em) => {
        await em.getRepository(Order).save(order)
        await recordOrderStatusLog({
          manager: em,
          orderId: order.orderId,
          storeId: order.storeId,
          fromStatus: prevStatus,
          toStatus: order.status,
          reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
          remark: null,
          changedByUserId: user?.userId || null,
          changedByUserRole: user?.role || null
        })
      })
      if (order.tableId) emitToTable(order.tableId, 'ORDER_STATUS_CHANGED', { orderId, status: order.status })
    }
    try {
      const tableRepo = AppDataSource.getRepository(Table)
      const table = order.tableId ? await tableRepo.findOne({ where: { tableId: order.tableId } }) : null
      const storeRepo = AppDataSource.getRepository(Store)
      const tenantId = (await storeRepo.findOne({ where: { storeId: order.storeId } }))?.tenantId || null
      const repo = AppDataSource.getRepository(Notification)
      const n = repo.create({
        notificationId: genId('ntf'),
        type: 'REFUND_REQUESTED',
        title: '退款申请',
        message: `${table?.code || '桌台'} 申请退款`,
        orderId: order.orderId,
        tableId: order.tableId || null,
        tableCode: table?.code || null,
        tenantId,
        storeId: order.storeId,
        status: 'UNREAD',
        readAt: null,
        handledAt: null,
        payload: {
          orderId: order.orderId,
          refundId: refund.refundId,
          amountCents: refund.amount,
          tableId: order.tableId || null,
          tableCode: table?.code || null,
          reason: refund.reason || null
        }
      })
      await repo.save(n)
      emitAdminNotification({ notificationId: n.notificationId })
    } catch (err) {
      console.error('[orders] failed to persist REFUND_REQUESTED notification', {
        orderId: order.orderId,
        refundId: refund.refundId,
        err: err instanceof Error ? err.message : String(err)
      })
    }
    accepted(res, { orderId, refundId: refund.refundId, status: refund.status }, 'Refund requested.')
  })
)

router.get(
  '/api/v1/orders/:orderId/refunds',
  requireAuth,
  requireAdminContextIfAdmin,
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const user = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const refundRepo = AppDataSource.getRepository(RefundTransaction)
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    if (user?.role === 'ADMIN') {
      const storeId = getActiveStoreId(req)
      if (order.storeId !== storeId) {
        res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
        return
      }
    }
    if (user?.role !== 'ADMIN' && order.userId !== user?.userId) {
      res.status(403).json({ success: false, code: 40300, message: 'Forbidden', data: null })
      return
    }
    const refunds = await refundRepo.find({ where: { orderId }, order: { id: 'DESC' }, take: 50 })
    ok(
      res,
      {
        list: refunds.map((r) => ({
          refundId: r.refundId,
          orderId: r.orderId,
          amount: r.amount,
          status: r.status,
          reason: r.reason,
          requestedAt: r.requestedAt,
          reviewedAt: r.reviewedAt,
          reviewedByUserId: r.reviewedByUserId,
          reviewRejectReason: r.reviewRejectReason,
          succeededAt: r.succeededAt
        }))
      },
      'Success'
    )
  })
)

router.put(
  '/api/v1/orders/:orderId/refunds/:refundId/review',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const { orderId, refundId } = req.params
    const { decision, reason } = req.body || {}
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      res.status(400).json({ success: false, code: 40000, message: 'Invalid decision', data: null })
      return
    }
    const user = getAuthUser(req)
    const orderRepo = AppDataSource.getRepository(Order)
    const refundRepo = AppDataSource.getRepository(RefundTransaction)
    const order = await orderRepo.findOne({ where: { orderId } })
    if (!order) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    const storeId = getActiveStoreId(req)
    if (order.storeId !== storeId) {
      res.status(404).json({ success: false, code: 40400, message: 'Order not found', data: null })
      return
    }
    const refund = await refundRepo.findOne({ where: { refundId, orderId } })
    if (!refund) {
      res.status(404).json({ success: false, code: 40400, message: 'Refund not found', data: null })
      return
    }
    if (refund.status !== 'REVIEWING') {
      res.status(400).json({ success: false, code: 40003, message: 'Review not allowed', data: null })
      return
    }
    refund.reviewedAt = new Date()
    refund.reviewedByUserId = user?.userId || null
    if (decision === 'APPROVE') {
      refund.status = 'PENDING'
      refund.reviewRejectReason = null
      await refundRepo.save(refund)
      if (order.status === 'Paid') {
        const prevStatus = order.status
        order.status = 'Refunding'
        await AppDataSource.manager.transaction(async (em) => {
          await em.getRepository(Order).save(order)
          await recordOrderStatusLog({
            manager: em,
            orderId: order.orderId,
            storeId: order.storeId,
            fromStatus: prevStatus,
            toStatus: order.status,
            reason: null,
            remark: null,
            changedByUserId: user?.userId || null,
            changedByUserRole: 'ADMIN'
          })
        })
      }
      if (order.tableId) emitToTable(order.tableId, 'ORDER_STATUS_CHANGED', { orderId, status: order.status })
      ok(res, { orderId, refundId: refund.refundId, status: refund.status, orderStatus: order.status }, 'Approved')
      return
    }
    refund.status = 'REJECTED'
    refund.reviewRejectReason = typeof reason === 'string' && reason.trim() ? reason.trim() : '审核不通过'
    await refundRepo.save(refund)
    if (order.status === 'Refunding') {
      const prevStatus = order.status
      order.status = 'Paid'
      await AppDataSource.manager.transaction(async (em) => {
        await em.getRepository(Order).save(order)
        await recordOrderStatusLog({
          manager: em,
          orderId: order.orderId,
          storeId: order.storeId,
          fromStatus: prevStatus,
          toStatus: order.status,
          reason: refund.reviewRejectReason || null,
          remark: null,
          changedByUserId: user?.userId || null,
          changedByUserRole: 'ADMIN'
        })
      })
      if (order.tableId) emitToTable(order.tableId, 'ORDER_STATUS_CHANGED', { orderId, status: order.status })
    }
    ok(res, { orderId, refundId: refund.refundId, status: refund.status, orderStatus: order.status }, 'Rejected')
  })
)

export default router
