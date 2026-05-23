import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middlewares/auth'
import { ok } from '../http/responses'
import { AppDataSource } from '../db'
import { Table } from '../entities/Table'
import { Order } from '../entities/Order'
import { asyncHandler } from '../http/asyncHandler'
import { TableCart } from '../entities/TableCart'
import { TableCartItem } from '../entities/TableCartItem'
import { OrderItem } from '../entities/OrderItem'
import { In } from 'typeorm'
import { getActiveStoreId, requireAdminContext } from '../middlewares/adminAuthz'

const router = Router()

router.get(
  '/api/v1/dashboard/overview',
  requireAuth,
  requireAdmin,
  requireAdminContext,
  asyncHandler(async (req, res) => {
    const tableRepo = AppDataSource.getRepository(Table)
    const cartRepo = AppDataSource.getRepository(TableCart)
    const cartItemRepo = AppDataSource.getRepository(TableCartItem)
    const orderRepo = AppDataSource.getRepository(Order)
    const orderItemRepo = AppDataSource.getRepository(OrderItem)

    const storeId = getActiveStoreId(req)
    const tables = await tableRepo.find({ where: { storeId } })
    const tableIds = tables.map((t) => t.tableId)
    const tableCodeById = new Map(tables.map((t) => [t.tableId, t.code]))
    const activeOrders = tableIds.length
      ? await orderRepo
          .createQueryBuilder('o')
          .innerJoin(Table, 't', 't.tableId = o.tableId AND t.sessionVersion = o.tableSessionVersion')
          .where('o.tableId IN (:...tableIds)', { tableIds })
          .andWhere('o.storeId = :storeId', { storeId })
          .andWhere('o.status IN (:...statuses)', { statuses: ['Paid', 'Making'] })
          .orderBy('o.id', 'DESC')
          .getMany()
      : []
    const orderAggRows = tableIds.length
      ? await orderRepo
          .createQueryBuilder('o')
          .innerJoin(Table, 't', 't.tableId = o.tableId AND t.sessionVersion = o.tableSessionVersion')
          .select('o.tableId', 'tableId')
          .addSelect('COUNT(1)', 'totalOrderCount')
          .addSelect("SUM(CASE WHEN o.status <> 'Refunded' THEN o.totalAmount ELSE 0 END)", 'totalAmountExRefunded')
          .where('o.tableId IN (:...tableIds)', { tableIds })
          .andWhere('o.storeId = :storeId', { storeId })
          .groupBy('o.tableId')
          .getRawMany()
      : []
    const orderAggByTableId = new Map<string, { totalOrderCount: number; totalAmountExRefunded: string }>()
    for (const r of orderAggRows as any[]) {
      orderAggByTableId.set(String(r.tableId), {
        totalOrderCount: parseInt(String(r.totalOrderCount || '0'), 10) || 0,
        totalAmountExRefunded: String(r.totalAmountExRefunded || '0')
      })
    }
    const activeOrderIds = activeOrders.map((o) => o.orderId)
    const activeOrderItems = activeOrderIds.length
      ? await orderItemRepo.find({ where: { orderId: In(activeOrderIds) } })
      : []

    const pendingItemsByOrderId = new Map<string, any[]>()
    for (const it of activeOrderItems) {
      if (it.servedQty >= it.qty) continue
      const list = pendingItemsByOrderId.get(it.orderId) || []
      list.push({
        orderItemId: it.orderItemId,
        goodNameSnapshot: it.goodNameSnapshot,
        specTextSnapshot: it.specTextSnapshot,
        qty: it.qty,
        servedQty: it.servedQty
      })
      pendingItemsByOrderId.set(it.orderId, list)
    }

    const tableActiveOrdersByTableId = new Map<string, any[]>()
    for (const o of activeOrders) {
      const list = tableActiveOrdersByTableId.get(o.tableId) || []
      list.push({
        orderId: o.orderId,
        orderNo: o.orderNo,
        status: o.status,
        totalAmount: o.totalAmount,
        remark: o.remark,
        createdAt: o.paidAt
      })
      tableActiveOrdersByTableId.set(o.tableId, list)
    }

    const tableOutputs = []
    for (const t of tables) {
      const carts = await cartRepo.find({
        where: { storeId, tableId: t.tableId, sessionVersion: t.sessionVersion },
        order: { id: 'DESC' },
        take: 1
      })
      const cart = carts[0]
      let cartOut: any = null
      let openedAt: any = null
      if (cart) {
        const items = await cartItemRepo.find({ where: { cartId: cart.cartId } })
        openedAt = cart.openedAt
        cartOut = {
          cartId: cart.cartId,
          version: cart.version,
          updatedAt: cart.updatedAt,
          items: items.map((it) => ({
            cartItemId: it.cartItemId,
            skuId: it.skuId,
            goodNameSnapshot: it.goodNameSnapshot,
            specTextSnapshot: it.specTextSnapshot,
            unitPriceSnapshot: it.unitPriceSnapshot,
            qty: it.qty,
            addedByNicknameSnapshot: it.addedByNicknameSnapshot,
            addedByAvatarSnapshot: it.addedByAvatarSnapshot
          }))
        }
      }
      tableOutputs.push({
        tableId: t.tableId,
        code: t.code,
        status: t.status,
        sessionVersion: t.sessionVersion,
        openedAt,
        cart: cartOut,
        activeOrders: tableActiveOrdersByTableId.get(t.tableId) || [],
        totalOrderCount: orderAggByTableId.get(t.tableId)?.totalOrderCount || 0,
        totalAmountExRefunded: orderAggByTableId.get(t.tableId)?.totalAmountExRefunded || '0'
      })
    }

    const activeOrderOutputs = activeOrders.map((o) => ({
      orderId: o.orderId,
      orderNo: o.orderNo,
      tableCode: tableCodeById.get(o.tableId) || '',
      status: o.status,
      remark: o.remark,
      pendingItems: pendingItemsByOrderId.get(o.orderId) || []
    }))

    ok(res, { tables: tableOutputs, activeOrders: activeOrderOutputs })
  })
)

export default router
