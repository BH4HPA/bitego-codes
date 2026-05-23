import type { DataSource } from 'typeorm'
import { Tenant } from '../entities/Tenant'
import { Store } from '../entities/Store'

export async function ensureStoreDefaultTenantAndStore(ds: DataSource) {
  if (!ds.isInitialized) return
  const tenantRepo = ds.getRepository(Tenant)
  const storeRepo = ds.getRepository(Store)

  const tenantRow = await tenantRepo
    .createQueryBuilder('t')
    .withDeleted()
    .where('t.tenantId = :tenantId', { tenantId: 'store_default' })
    .getOne()

  if (!tenantRow) {
    try {
      await tenantRepo.save(
        tenantRepo.create({
          tenantId: 'store_default',
          type: 'SINGLE',
          brandName: '默认门店',
          brandLogoUrl: null,
          primaryStoreId: 'store_default',
          status: 'ACTIVE',
          lastSyncedChangeId: null,
          lastSyncedAt: null
        })
      )
    } catch {}
  } else {
    if (tenantRow.deletedAt) {
      await tenantRepo.restore({ tenantId: 'store_default' })
    }
    const patch: Partial<Tenant> = {}
    if (tenantRow.type !== 'SINGLE') patch.type = 'SINGLE'
    if (!tenantRow.brandName) patch.brandName = '默认门店'
    if (tenantRow.primaryStoreId !== 'store_default') patch.primaryStoreId = 'store_default'
    if (tenantRow.status !== 'ACTIVE') patch.status = 'ACTIVE'
    if (Object.keys(patch).length) {
      await tenantRepo.update({ tenantId: 'store_default' }, patch)
    }
  }

  const storeRow = await storeRepo
    .createQueryBuilder('s')
    .withDeleted()
    .where('s.storeId = :storeId', { storeId: 'store_default' })
    .getOne()

  if (!storeRow) {
    try {
      await storeRepo.save(
        storeRepo.create({
          storeId: 'store_default',
          tenantId: 'store_default',
          isPrimary: 1,
          subName: null,
          name: '默认门店',
          logoUrl: '',
          phone: '',
          address: '',
          description: ''
        })
      )
    } catch {}
  } else {
    if (storeRow.deletedAt) {
      await storeRepo.restore({ storeId: 'store_default' })
    }
    const patch: Partial<Store> = {}
    if (storeRow.tenantId !== 'store_default') patch.tenantId = 'store_default'
    if (Number(storeRow.isPrimary || 0) !== 1) patch.isPrimary = 1
    if (!storeRow.name) patch.name = '默认门店'
    if (Object.keys(patch).length) {
      await storeRepo.update({ storeId: 'store_default' }, patch)
    }
  }

  await ds.query(
    "UPDATE `notifications` SET `storeId` = NULL WHERE `deletedAt` IS NULL AND `tenantId` IS NULL AND `storeId` = 'store_default'"
  )

  const tenants = await tenantRepo.createQueryBuilder('t').where('t.deletedAt IS NULL').getMany()
  for (const t of tenants) {
    if (t.tenantId === 'store_default') continue
    if (!t.primaryStoreId) continue
    await ds.query(
      'UPDATE `stores` SET `deletedAt` = CURRENT_TIMESTAMP(3) WHERE `deletedAt` IS NULL AND `tenantId` = ? AND `storeId` = ? AND `storeId` <> ?',
      [t.tenantId, t.tenantId, t.primaryStoreId]
    )
    await ds.query(
      'UPDATE `stores` SET `isPrimary` = 0 WHERE `deletedAt` IS NULL AND `tenantId` = ? AND `storeId` <> ? AND `isPrimary` = 1',
      [t.tenantId, t.primaryStoreId]
    )
    await ds.query('UPDATE `stores` SET `isPrimary` = 1 WHERE `deletedAt` IS NULL AND `storeId` = ?', [
      t.primaryStoreId
    ])
  }
}
