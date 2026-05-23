import { MigrationInterface, QueryRunner } from 'typeorm'

export class SingleTenantBrandNameBackfill1770000024000 implements MigrationInterface {
  name = 'SingleTenantBrandNameBackfill1770000024000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasTenants = (await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ['tenants']
    )) as Array<{ TABLE_NAME: string }>
    if (!hasTenants?.length) return

    const hasStores = (await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ['stores']
    )) as Array<{ TABLE_NAME: string }>
    if (!hasStores?.length) return

    // JOIN 用 utf8mb4_unicode_ci 兼容两列可能不同的 collation；
    // 漂移检测必须走二进制比较，否则仅大小写不同的值会被当作相等跳过。
    const result = (await queryRunner.query(
      `UPDATE \`tenants\` AS t
         INNER JOIN \`stores\` AS s
            ON s.storeId = t.primaryStoreId COLLATE utf8mb4_unicode_ci
           AND s.deletedAt IS NULL
         SET t.brandName = s.name
         WHERE t.deletedAt IS NULL
           AND t.type = 'SINGLE'
           AND t.brandName COLLATE utf8mb4_bin <> s.name COLLATE utf8mb4_bin`
    )) as { affectedRows?: number } | undefined

    if (!result?.affectedRows) {
      console.log('[migration 0024] no drifted SINGLE tenants found, skipped')
    }
  }

  async down(): Promise<void> {
    // 单店租户的 brandName 以门店 name 为权威来源，历史漂移值不再保留。
  }
}
