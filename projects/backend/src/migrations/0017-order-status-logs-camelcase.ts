import { MigrationInterface, QueryRunner } from 'typeorm'

export class OrderStatusLogsCamelCase1770000017000 implements MigrationInterface {
  name = 'OrderStatusLogsCamelCase1770000017000'

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
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
      )) as Array<{ COLUMN_NAME: string }>
      return Boolean(rows?.length)
    }

    if (!(await table('order_status_logs'))) return

    if (await col('order_status_logs', 'log_id')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `log_id` `logId` VARCHAR(64) NOT NULL')
    }
    if (await col('order_status_logs', 'order_id')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `order_id` `orderId` VARCHAR(32) NOT NULL')
    }
    if (await col('order_status_logs', 'store_id')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `store_id` `storeId` VARCHAR(32) NOT NULL')
    }
    if (await col('order_status_logs', 'from_status')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `from_status` `fromStatus` VARCHAR(20) NULL'
      )
    }
    if (await col('order_status_logs', 'to_status')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `to_status` `toStatus` VARCHAR(20) NOT NULL'
      )
    }
    if (await col('order_status_logs', 'changed_by_user_id')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `changed_by_user_id` `changedByUserId` VARCHAR(32) NULL'
      )
    }
    if (await col('order_status_logs', 'changed_by_user_role')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `changed_by_user_role` `changedByUserRole` VARCHAR(20) NULL'
      )
    }
    if (await col('order_status_logs', 'created_at')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `created_at` `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)'
      )
    }
    if (await col('order_status_logs', 'updated_at')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `updated_at` `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'
      )
    }
    if (await col('order_status_logs', 'deleted_at')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `deleted_at` `deletedAt` DATETIME(3) NULL')
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

    const col = async (tableName: string, columnName: string) => {
      const rows = (await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
      )) as Array<{ COLUMN_NAME: string }>
      return Boolean(rows?.length)
    }

    if (!(await table('order_status_logs'))) return

    if (await col('order_status_logs', 'logId')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `logId` `log_id` VARCHAR(64) NOT NULL')
    }
    if (await col('order_status_logs', 'orderId')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `orderId` `order_id` VARCHAR(32) NOT NULL')
    }
    if (await col('order_status_logs', 'storeId')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `storeId` `store_id` VARCHAR(32) NOT NULL')
    }
    if (await col('order_status_logs', 'fromStatus')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `fromStatus` `from_status` VARCHAR(20) NULL'
      )
    }
    if (await col('order_status_logs', 'toStatus')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `toStatus` `to_status` VARCHAR(20) NOT NULL'
      )
    }
    if (await col('order_status_logs', 'changedByUserId')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `changedByUserId` `changed_by_user_id` VARCHAR(32) NULL'
      )
    }
    if (await col('order_status_logs', 'changedByUserRole')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `changedByUserRole` `changed_by_user_role` VARCHAR(20) NULL'
      )
    }
    if (await col('order_status_logs', 'createdAt')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `createdAt` `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)'
      )
    }
    if (await col('order_status_logs', 'updatedAt')) {
      await queryRunner.query(
        'ALTER TABLE `order_status_logs` CHANGE COLUMN `updatedAt` `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'
      )
    }
    if (await col('order_status_logs', 'deletedAt')) {
      await queryRunner.query('ALTER TABLE `order_status_logs` CHANGE COLUMN `deletedAt` `deleted_at` DATETIME(3) NULL')
    }
  }
}
