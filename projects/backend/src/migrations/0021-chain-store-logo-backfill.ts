import { MigrationInterface, QueryRunner } from 'typeorm'

export class ChainStoreLogoBackfill1770000021000 implements MigrationInterface {
  name = 'ChainStoreLogoBackfill1770000021000'

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

    await queryRunner.query(
      `UPDATE \`stores\` AS s
         INNER JOIN \`tenants\` AS t
            ON t.tenantId = s.tenantId COLLATE utf8mb4_unicode_ci
           AND t.deletedAt IS NULL
           AND t.type = 'CHAIN'
         SET s.logoUrl = COALESCE(t.brandLogoUrl, '')
         WHERE s.deletedAt IS NULL
           AND s.logoUrl COLLATE utf8mb4_unicode_ci <> COALESCE(t.brandLogoUrl, '')`
    )
  }

  async down(): Promise<void> {
    // 连锁门店 Logo 以品牌 Logo 为唯一来源，历史分支数据不再保留。
  }
}
