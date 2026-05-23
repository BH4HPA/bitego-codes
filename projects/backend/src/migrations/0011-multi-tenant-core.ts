import { MigrationInterface, QueryRunner } from 'typeorm'

export class MultiTenantCore1770000011000 implements MigrationInterface {
  name = 'MultiTenantCore1770000011000'

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

    if (!(await table('tenants'))) {
      await queryRunner.query(
        "CREATE TABLE `tenants` (`id` INT NOT NULL AUTO_INCREMENT, `tenantId` VARCHAR(32) NOT NULL, `type` VARCHAR(20) NOT NULL DEFAULT 'SINGLE', `brandName` VARCHAR(100) NOT NULL, `brandLogoUrl` VARCHAR(500) NULL, `primaryStoreId` VARCHAR(32) NULL, `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), `deletedAt` DATETIME(3) NULL, UNIQUE INDEX `IDX_tenants_tenantId` (`tenantId`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
      )
    }

    if (!(await table('admin_scopes'))) {
      await queryRunner.query(
        "CREATE TABLE `admin_scopes` (`id` INT NOT NULL AUTO_INCREMENT, `scopeId` VARCHAR(64) NOT NULL, `userId` VARCHAR(32) NOT NULL, `tenantId` VARCHAR(32) NOT NULL, `storeId` VARCHAR(32) NULL, `role` VARCHAR(20) NOT NULL, `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), `deletedAt` DATETIME(3) NULL, UNIQUE INDEX `IDX_admin_scopes_scopeId` (`scopeId`), INDEX `IDX_admin_scopes_userId` (`userId`), INDEX `IDX_admin_scopes_tenantId` (`tenantId`), INDEX `IDX_admin_scopes_storeId` (`storeId`), INDEX `IDX_admin_scopes_role` (`role`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
      )
    }

    if (!(await table('platform_configs'))) {
      await queryRunner.query(
        "CREATE TABLE `platform_configs` (`id` INT NOT NULL AUTO_INCREMENT, `configId` VARCHAR(64) NOT NULL, `platformName` VARCHAR(100) NOT NULL DEFAULT 'BiteGo 点点餐', `platformLogoUrl` VARCHAR(500) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), `deletedAt` DATETIME(3) NULL, UNIQUE INDEX `IDX_platform_configs_configId` (`configId`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
      )
    }

    if (!(await table('store_sync_jobs'))) {
      await queryRunner.query(
        "CREATE TABLE `store_sync_jobs` (`id` INT NOT NULL AUTO_INCREMENT, `jobId` VARCHAR(64) NOT NULL, `tenantId` VARCHAR(32) NOT NULL, `sourceStoreId` VARCHAR(32) NOT NULL, `targetStoreId` VARCHAR(32) NOT NULL, `kind` VARCHAR(32) NOT NULL, `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING', `payload` JSON NULL, `errorMessage` VARCHAR(500) NULL, `startedAt` DATETIME NULL, `finishedAt` DATETIME NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), `deletedAt` DATETIME(3) NULL, UNIQUE INDEX `IDX_store_sync_jobs_jobId` (`jobId`), INDEX `IDX_store_sync_jobs_tenantId` (`tenantId`), INDEX `IDX_store_sync_jobs_sourceStoreId` (`sourceStoreId`), INDEX `IDX_store_sync_jobs_targetStoreId` (`targetStoreId`), INDEX `IDX_store_sync_jobs_kind` (`kind`), INDEX `IDX_store_sync_jobs_status` (`status`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
      )
    }

    if (await table('stores')) {
      if (!(await col('stores', 'tenantId'))) {
        await queryRunner.query('ALTER TABLE `stores` ADD COLUMN `tenantId` VARCHAR(32) NULL')
        await queryRunner.query('UPDATE `stores` SET `tenantId` = `storeId` WHERE `tenantId` IS NULL')
      }
      if (!(await col('stores', 'isPrimary'))) {
        await queryRunner.query('ALTER TABLE `stores` ADD COLUMN `isPrimary` TINYINT NOT NULL DEFAULT 1')
      }
      if (!(await col('stores', 'subName'))) {
        await queryRunner.query('ALTER TABLE `stores` ADD COLUMN `subName` VARCHAR(100) NULL')
      }
    }

    if (await table('notifications')) {
      if (!(await col('notifications', 'tenantId'))) {
        await queryRunner.query('ALTER TABLE `notifications` ADD COLUMN `tenantId` VARCHAR(32) NULL')
      }
      if (!(await col('notifications', 'storeId'))) {
        await queryRunner.query('ALTER TABLE `notifications` ADD COLUMN `storeId` VARCHAR(32) NULL')
        await queryRunner.query("UPDATE `notifications` SET `storeId` = 'store_default' WHERE `storeId` IS NULL")
      }
    }

    if (await table('tenants')) {
      const existing = (await queryRunner.query('SELECT tenantId FROM `tenants` WHERE tenantId = ?', [
        'store_default'
      ])) as Array<{
        tenantId: string
      }>
      if (!existing?.length) {
        await queryRunner.query(
          'INSERT INTO `tenants` (`tenantId`, `type`, `brandName`, `brandLogoUrl`, `primaryStoreId`, `status`) VALUES (?, ?, ?, ?, ?, ?)',
          ['store_default', 'SINGLE', 'BiteGo 点点餐', null, 'store_default', 'ACTIVE']
        )
      }
    }

    if (await table('platform_configs')) {
      const existing = (await queryRunner.query('SELECT configId FROM `platform_configs` WHERE configId = ?', [
        'platform_default'
      ])) as Array<{
        configId: string
      }>
      if (!existing?.length) {
        await queryRunner.query(
          'INSERT INTO `platform_configs` (`configId`, `platformName`, `platformLogoUrl`) VALUES (?, ?, ?)',
          ['platform_default', 'BiteGo 点点餐', null]
        )
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
