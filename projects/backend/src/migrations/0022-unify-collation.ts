import { MigrationInterface, QueryRunner } from 'typeorm'

const TARGET_CHARSET = 'utf8mb4'
const TARGET_COLLATION = 'utf8mb4_unicode_ci'

// 所有由 TypeORM 实体或历史 migration 创建的业务表。
// TypeORM 自带的 migrations 表不在此列 —— 它由框架管理，无需规范化。
const TABLES = [
  'admin_scopes',
  'categories',
  'good_categories',
  'good_shared_spec_groups',
  'good_spec_change_logs',
  'goods',
  'notifications',
  'order_items',
  'order_status_logs',
  'orders',
  'payment_transactions',
  'platform_configs',
  'refund_transactions',
  'shared_spec_groups',
  'shared_spec_options',
  'skus',
  'spec_groups',
  'spec_options',
  'store_default_migration_log',
  'store_sync_changes',
  'store_sync_jobs',
  'stores',
  'table_cart_items',
  'table_carts',
  'tables',
  'tenants',
  'users'
]

export class UnifyCollation1770000022000 implements MigrationInterface {
  name = 'UnifyCollation1770000022000'

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      const rows = (await queryRunner.query(
        `SELECT TABLE_COLLATION FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      )) as Array<{ TABLE_COLLATION: string }>
      if (!rows?.length) continue
      if (rows[0].TABLE_COLLATION === TARGET_COLLATION) continue
      await queryRunner.query(
        `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET ${TARGET_CHARSET} COLLATE ${TARGET_COLLATION}`
      )
    }
  }

  async down(): Promise<void> {
    // collation 属于 schema 基线，不做回滚。
  }
}
