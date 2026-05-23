import type { EntityManager } from 'typeorm'
import { OrderStatusLog } from '../entities/OrderStatusLog'
import { genId } from '../utils/id'

export async function recordOrderStatusLog(params: {
  manager: EntityManager
  orderId: string
  storeId: string
  fromStatus: string | null
  toStatus: string
  reason?: string | null
  remark?: string | null
  changedByUserId?: string | null
  changedByUserRole?: string | null
}): Promise<OrderStatusLog> {
  const repo = params.manager.getRepository(OrderStatusLog)
  const row = repo.create({
    logId: genId('osl'),
    orderId: params.orderId,
    storeId: params.storeId,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    reason: params.reason ?? null,
    remark: params.remark ?? null,
    changedByUserId: params.changedByUserId ?? null,
    changedByUserRole: params.changedByUserRole ?? null
  })
  await repo.save(row)
  return row
}
