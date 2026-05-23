import { AppDataSource } from '../db'
import { RefundTransaction } from '../entities/RefundTransaction'
import { Order } from '../entities/Order'
import { OrderItem } from '../entities/OrderItem'
import { SKU } from '../entities/SKU'
import { Good } from '../entities/Good'
import { withRedisLock } from '../redis'
import { In } from 'typeorm'
import { recordOrderStatusLog } from '../services/orderStatusLogService'

export async function runRefundWorkerOnce(params?: { etaMs?: number; nowMs?: number }) {
  const now = params?.nowMs ?? Date.now()
  const etaMs = params?.etaMs ?? parseInt(process.env.REFUND_ETA_MS || '10000', 10)
  const refundRepo = AppDataSource.getRepository(RefundTransaction)
  const orderRepo = AppDataSource.getRepository(Order)
  const orderItemRepo = AppDataSource.getRepository(OrderItem)
  const skuRepo = AppDataSource.getRepository(SKU)
  const goodRepo = AppDataSource.getRepository(Good)
  const pending = await refundRepo.find({ where: { status: 'PENDING' } })
  for (const r of pending) {
    const requestedAt = r.requestedAt ? new Date(r.requestedAt).getTime() : 0
    if (requestedAt && now - requestedAt < etaMs) continue
    r.status = 'SUCCESS'
    r.succeededAt = new Date()
    await refundRepo.save(r)
    const o = await orderRepo.findOne({ where: { orderId: r.orderId } })
    if (!o) continue
    const prevStatus = o.status
    o.status = 'Refunded'
    o.refundedAmount = r.amount
    o.refundedAt = r.succeededAt
    await orderRepo.save(o)
    if (prevStatus !== o.status) {
      await recordOrderStatusLog({
        manager: AppDataSource.manager,
        orderId: o.orderId,
        storeId: o.storeId,
        fromStatus: prevStatus || null,
        toStatus: o.status,
        reason: null,
        remark: 'Refund succeeded',
        changedByUserId: null,
        changedByUserRole: 'SYSTEM'
      })
    }
    if (prevStatus !== 'Refunded') {
      const items = await orderItemRepo.find({ where: { orderId: o.orderId } })
      const skuIds = Array.from(new Set(items.map((x) => x.skuId).filter(Boolean)))
      const skus = skuIds.length ? await skuRepo.find({ where: { skuId: In(skuIds) } }) : []
      const skuById = new Map<string, SKU>()
      for (const s of skus) skuById.set(s.skuId, s)
      const goodQty = new Map<string, number>()
      const skuQty = new Map<string, number>()
      for (const it of items) {
        const sku = skuById.get(it.skuId)
        if (!sku) continue
        goodQty.set(sku.goodId, (goodQty.get(sku.goodId) || 0) + it.qty)
        skuQty.set(sku.skuId, (skuQty.get(sku.skuId) || 0) + it.qty)
      }
      for (const [skuId, qty] of skuQty.entries()) {
        if (!qty) continue
        await skuRepo
          .createQueryBuilder()
          .update(SKU)
          .set({ stock: () => `stock + ${qty}` })
          .where('skuId = :skuId', { skuId })
          .execute()
      }
      if (prevStatus !== 'Canceled') {
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
    }
  }
}

export function startRefundWorker() {
  const intervalMs = parseInt(process.env.REFUND_WORKER_INTERVAL_MS || '2000', 10)
  setInterval(() => {
    withRedisLock('refund-worker', 5000, async () => {
      await runRefundWorkerOnce()
      return true
    }).catch(() => null)
  }, intervalMs)
}
