import { MigrationInterface, QueryRunner } from 'typeorm'

export class StoreSyncDirtyStatus1770000014000 implements MigrationInterface {
  name = 'StoreSyncDirtyStatus1770000014000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = async (tableName: string) => {
      const rows = (await queryRunner.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      )) as Array<{ TABLE_NAME: string }>
      return Boolean(rows?.length)
    }

    const col = async (tableName: string, columnName: string) => {
      const rows = (await queryRunner.query(
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
      )) as Array<{ DATA_TYPE: string }>
      return Boolean(rows?.length)
    }

    if (await table('tenants')) {
      if (!(await col('tenants', 'lastSyncedChangeId'))) {
        await queryRunner.query('ALTER TABLE `tenants` ADD COLUMN `lastSyncedChangeId` BIGINT NULL')
      }
      if (!(await col('tenants', 'lastSyncedAt'))) {
        await queryRunner.query('ALTER TABLE `tenants` ADD COLUMN `lastSyncedAt` DATETIME NULL')
      }
    }

    if (await table('store_sync_jobs')) {
      if (!(await col('store_sync_jobs', 'batchId'))) {
        await queryRunner.query('ALTER TABLE `store_sync_jobs` ADD COLUMN `batchId` VARCHAR(64) NULL')
        await queryRunner.query('CREATE INDEX `IDX_store_sync_jobs_batchId` ON `store_sync_jobs` (`batchId`)')
      }
      if (!(await col('store_sync_jobs', 'upToChangeId'))) {
        await queryRunner.query('ALTER TABLE `store_sync_jobs` ADD COLUMN `upToChangeId` BIGINT NULL')
      }
    }

    if (!(await table('store_sync_changes'))) {
      await queryRunner.query(
        'CREATE TABLE `store_sync_changes` (`id` INT NOT NULL AUTO_INCREMENT, `tenantId` VARCHAR(32) NOT NULL, `sourceStoreId` VARCHAR(32) NOT NULL, `entityType` VARCHAR(32) NOT NULL, `entityTemplateId` VARCHAR(32) NOT NULL, `action` VARCHAR(20) NOT NULL, `name` VARCHAR(100) NOT NULL, `changedByUserId` VARCHAR(32) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), `deletedAt` DATETIME(3) NULL, INDEX `IDX_store_sync_changes_tenantId` (`tenantId`), INDEX `IDX_store_sync_changes_sourceStoreId` (`sourceStoreId`), INDEX `IDX_store_sync_changes_entityType` (`entityType`), INDEX `IDX_store_sync_changes_entityTemplateId` (`entityTemplateId`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
      )
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
