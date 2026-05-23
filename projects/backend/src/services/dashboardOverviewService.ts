import { AppDataSource } from '../db'
import { In } from 'typeorm'
import { Table } from '../entities/Table'
import { Order } from '../entities/Order'
import { OrderItem } from '../entities/OrderItem'
import { TableCart } from '../entities/TableCart'
import { TableCartItem } from '../entities/TableCartItem'

export async function getDashboardOverviewSnapshot(storeId: string) {
  const tableRepo = AppDataSource.getRepository(Table)
  const cartRepo = AppDataSource.getRepository(TableCart)
  const cartItemRepo = AppDataSource.getRepository(TableCartItem)
  const orderRepo = AppDataSource.getRepository(Order)
  const orderItemRepo = AppDataSource.getRepository(OrderItem)

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

  const tableById = new Map(tables.map((t) => [t.tableId, t]))
  const sessionPairs = tables.map((t) => ({ tableId: t.tableId, sessionVersion: t.sessionVersion }))
  const sessionPairsKey = new Set(sessionPairs.map((p) => `${p.tableId}_${p.sessionVersion}`))

  const latestCartIdsRows =
    tableIds.length && sessionPairs.length
      ? await cartRepo
          .createQueryBuilder('c')
          .select('MAX(c.id)', 'id')
          .addSelect('c.tableId', 'tableId')
          .addSelect('c.sessionVersion', 'sessionVersion')
          .where('c.storeId = :storeId', { storeId })
          .andWhere('c.tableId IN (:...tableIds)', { tableIds })
          .groupBy('c.tableId')
          .addGroupBy('c.sessionVersion')
          .getRawMany<{ id: string; tableId: string; sessionVersion: number }>()
      : []

  const latestCartIds = latestCartIdsRows
    .filter((r) => sessionPairsKey.has(`${String(r.tableId)}_${Number(r.sessionVersion)}`))
    .map((r) => Number(r.id))
    .filter((x) => Number.isFinite(x) && x > 0)

  const latestCarts = latestCartIds.length ? await cartRepo.find({ where: { id: In(latestCartIds) as any } }) : []
  const cartById = new Map(latestCarts.map((c) => [c.cartId, c]))

  const cartItems = latestCarts.length
    ? await cartItemRepo.find({ where: { cartId: In(latestCarts.map((c) => c.cartId)) } })
    : []
  const cartItemsByCartId = new Map<string, any[]>()
  for (const it of cartItems) {
    const list = cartItemsByCartId.get(it.cartId) || []
    list.push({
      cartItemId: it.cartItemId,
      skuId: it.skuId,
      goodNameSnapshot: it.goodNameSnapshot,
      specTextSnapshot: it.specTextSnapshot,
      unitPriceSnapshot: it.unitPriceSnapshot,
      qty: it.qty,
      addedByNicknameSnapshot: it.addedByNicknameSnapshot,
      addedByAvatarSnapshot: it.addedByAvatarSnapshot
    })
    cartItemsByCartId.set(it.cartId, list)
  }

  const latestCartByTable = new Map<string, TableCart>()
  for (const c of latestCarts) {
    const t = tableById.get(c.tableId)
    if (!t) continue
    if (Number(c.sessionVersion) !== Number(t.sessionVersion)) continue
    latestCartByTable.set(c.tableId, c)
  }

  const tableOutputs = []
  for (const t of tables) {
    const cart = latestCartByTable.get(t.tableId)
    let cartOut: any = null
    let openedAt: any = null
    if (cart && cartById.get(cart.cartId)) {
      openedAt = cart.openedAt
      cartOut = {
        cartId: cart.cartId,
        version: cart.version,
        updatedAt: cart.updatedAt,
        items: cartItemsByCartId.get(cart.cartId) || []
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

  return { tables: tableOutputs, activeOrders: activeOrderOutputs }
}
