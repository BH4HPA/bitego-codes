import { MigrationInterface, QueryRunner } from 'typeorm'

export class StoreDefaultHardening1770000016000 implements MigrationInterface {
  name = 'StoreDefaultHardening1770000016000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = async (tableName: string) => {
      const rows = (await queryRunner.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      )) as Array<{ TABLE_NAME: string }>
      return Boolean(rows?.length)
    }

    if (!(await table('tenants')) || !(await table('stores'))) {
      return
    }

    if (!(await table('store_default_migration_log'))) {
      await queryRunner.query(
        'CREATE TABLE `store_default_migration_log` (`id` INT NOT NULL AUTO_INCREMENT, `kind` VARCHAR(50) NOT NULL, `keyId` VARCHAR(64) NOT NULL, `oldValue` VARCHAR(255) NULL, `newValue` VARCHAR(255) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `IDX_store_default_migration_log_kind` (`kind`), INDEX `IDX_store_default_migration_log_keyId` (`keyId`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
      )
    }

    const nullTenantStores = (await queryRunner.query(
      'SELECT `storeId` FROM `stores` WHERE `deletedAt` IS NULL AND `tenantId` IS NULL'
    )) as Array<{ storeId: string }>
    for (const r of nullTenantStores) {
      await queryRunner.query(
        'INSERT INTO `store_default_migration_log` (`kind`, `keyId`, `oldValue`, `newValue`) VALUES (?, ?, ?, ?)',
        ['stores.tenantId.backfill', r.storeId, null, r.storeId]
      )
    }
    await queryRunner.query(
      'UPDATE `stores` SET `tenantId` = `storeId` WHERE `deletedAt` IS NULL AND `tenantId` IS NULL'
    )

    const ensureTenant = async (
      tenantId: string,
      type: 'SINGLE' | 'CHAIN',
      brandName: string,
      primaryStoreId: string
    ) => {
      const existing = (await queryRunner.query(
        'SELECT `tenantId`, `deletedAt` FROM `tenants` WHERE `tenantId` = ? LIMIT 1',
        [tenantId]
      )) as Array<{ tenantId: string; deletedAt: string | null }>
      if (!existing?.length) {
        await queryRunner.query(
          'INSERT INTO `tenants` (`tenantId`, `type`, `brandName`, `brandLogoUrl`, `primaryStoreId`, `status`) VALUES (?, ?, ?, ?, ?, ?)',
          [tenantId, type, brandName, null, primaryStoreId, 'ACTIVE']
        )
        await queryRunner.query(
          'INSERT INTO `store_default_migration_log` (`kind`, `keyId`, `oldValue`, `newValue`) VALUES (?, ?, ?, ?)',
          ['tenants.inserted', tenantId, null, '1']
        )
        return
      }
      const deletedAt = existing[0].deletedAt
      if (deletedAt) {
        await queryRunner.query('UPDATE `tenants` SET `deletedAt` = NULL WHERE `tenantId` = ?', [tenantId])
        await queryRunner.query(
          'INSERT INTO `store_default_migration_log` (`kind`, `keyId`, `oldValue`, `newValue`) VALUES (?, ?, ?, ?)',
          ['tenants.restored', tenantId, deletedAt, null]
        )
      }
      await queryRunner.query(
        'UPDATE `tenants` SET `type` = ?, `primaryStoreId` = ?, `status` = ? WHERE `tenantId` = ?',
        [type, primaryStoreId, 'ACTIVE', tenantId]
      )
      await queryRunner.query(
        "UPDATE `tenants` SET `brandName` = ? WHERE `tenantId` = ? AND (`brandName` IS NULL OR `brandName` = '')",
        [brandName, tenantId]
      )
    }

    const ensureStore = async (storeId: string, tenantId: string, name: string) => {
      const existing = (await queryRunner.query(
        'SELECT `storeId`, `deletedAt` FROM `stores` WHERE `storeId` = ? LIMIT 1',
        [storeId]
      )) as Array<{ storeId: string; deletedAt: string | null }>
      if (!existing?.length) {
        await queryRunner.query(
          'INSERT INTO `stores` (`storeId`, `tenantId`, `isPrimary`, `subName`, `name`, `logoUrl`, `phone`, `address`, `description`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [storeId, tenantId, 1, null, name, '', '', '', '']
        )
        await queryRunner.query(
          'INSERT INTO `store_default_migration_log` (`kind`, `keyId`, `oldValue`, `newValue`) VALUES (?, ?, ?, ?)',
          ['stores.inserted', storeId, null, '1']
        )
        return
      }
      const deletedAt = existing[0].deletedAt
      if (deletedAt) {
        await queryRunner.query('UPDATE `stores` SET `deletedAt` = NULL WHERE `storeId` = ?', [storeId])
        await queryRunner.query(
          'INSERT INTO `store_default_migration_log` (`kind`, `keyId`, `oldValue`, `newValue`) VALUES (?, ?, ?, ?)',
          ['stores.restored', storeId, deletedAt, null]
        )
      }
      await queryRunner.query('UPDATE `stores` SET `tenantId` = ?, `isPrimary` = 1 WHERE `storeId` = ?', [
        tenantId,
        storeId
      ])
      await queryRunner.query(
        "UPDATE `stores` SET `name` = ? WHERE `storeId` = ? AND (`name` IS NULL OR `name` = '')",
        [name, storeId]
      )
    }

    await ensureTenant('store_default', 'SINGLE', '默认门店', 'store_default')
    await ensureStore('store_default', 'store_default', '默认门店')

    const stats = (await queryRunner.query(
      'SELECT `tenantId` AS tenantId, COUNT(1) AS cnt, MAX(CASE WHEN `isPrimary` = 1 THEN `storeId` ELSE NULL END) AS primaryStoreId, MIN(`storeId`) AS anyStoreId FROM `stores` WHERE `deletedAt` IS NULL AND `tenantId` IS NOT NULL GROUP BY `tenantId`'
    )) as Array<{ tenantId: string; cnt: number; primaryStoreId: string | null; anyStoreId: string }>
    for (const s of stats) {
      const desiredType = Number(s.cnt || 0) > 1 ? 'CHAIN' : 'SINGLE'
      const desiredPrimaryStoreId = s.primaryStoreId || s.anyStoreId
      if (!desiredPrimaryStoreId) continue
      const storeNameRows = (await queryRunner.query('SELECT `name` FROM `stores` WHERE `storeId` = ? LIMIT 1', [
        desiredPrimaryStoreId
      ])) as Array<{ name: string }>
      const storeName = storeNameRows?.[0]?.name || s.tenantId
      const desiredBrandName =
        s.tenantId === 'store_default' ? '默认门店' : desiredType === 'SINGLE' ? storeName : s.tenantId
      await ensureTenant(s.tenantId, desiredType as any, desiredBrandName, desiredPrimaryStoreId)
      if (!s.primaryStoreId) {
        await queryRunner.query('UPDATE `stores` SET `isPrimary` = 1 WHERE `storeId` = ?', [desiredPrimaryStoreId])
      }
    }

    if (await table('notifications')) {
      await queryRunner.query(
        "UPDATE `notifications` SET `storeId` = NULL WHERE `deletedAt` IS NULL AND `tenantId` IS NULL AND `storeId` = 'store_default'"
      )
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = async (tableName: string) => {
      const rows = (await queryRunner.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      )) as Array<{ TABLE_NAME: string }>
      return Boolean(rows?.length)
    }
    if (!(await table('store_default_migration_log'))) {
      return
    }
    const backfilled = (await queryRunner.query(
      "SELECT `keyId` FROM `store_default_migration_log` WHERE `kind` = 'stores.tenantId.backfill'"
    )) as Array<{ keyId: string }>
    for (const r of backfilled) {
      await queryRunner.query('UPDATE `stores` SET `tenantId` = NULL WHERE `storeId` = ?', [r.keyId])
    }
    const insertedStores = (await queryRunner.query(
      "SELECT `keyId` FROM `store_default_migration_log` WHERE `kind` = 'stores.inserted'"
    )) as Array<{ keyId: string }>
    for (const r of insertedStores) {
      await queryRunner.query('DELETE FROM `stores` WHERE `storeId` = ?', [r.keyId])
    }
    const insertedTenants = (await queryRunner.query(
      "SELECT `keyId` FROM `store_default_migration_log` WHERE `kind` = 'tenants.inserted'"
    )) as Array<{ keyId: string }>
    for (const r of insertedTenants) {
      await queryRunner.query('DELETE FROM `tenants` WHERE `tenantId` = ?', [r.keyId])
    }
  }
}
