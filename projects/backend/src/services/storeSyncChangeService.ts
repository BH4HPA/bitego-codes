import { EntityManager } from 'typeorm'
import { Store } from '../entities/Store'
import { StoreSyncChange } from '../entities/StoreSyncChange'

export async function isPrimaryStore(params: {
  manager: EntityManager
  tenantId: string
  storeId: string
}): Promise<boolean> {
  const row = await params.manager.getRepository(Store).findOne({ where: { storeId: params.storeId } })
  return Boolean(row && row.tenantId === params.tenantId && Number(row.isPrimary) === 1)
}

export async function recordStoreSyncChange(params: {
  manager: EntityManager
  tenantId: string
  sourceStoreId: string
  entityType: string
  entityTemplateId: string
  action: string
  name: string
  changedByUserId: string | null
}) {
  const repo = params.manager.getRepository(StoreSyncChange)
  const row = repo.create({
    tenantId: params.tenantId,
    sourceStoreId: params.sourceStoreId,
    entityType: params.entityType,
    entityTemplateId: params.entityTemplateId,
    action: params.action,
    name: params.name,
    changedByUserId: params.changedByUserId
  })
  await repo.save(row)
  return row
}
