import { MigrationInterface, QueryRunner } from 'typeorm'

export class SingleTenantPromoteStoreAdmin1770000020000 implements MigrationInterface {
  name = 'SingleTenantPromoteStoreAdmin1770000020000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasScopes = (await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ['admin_scopes']
    )) as Array<{ TABLE_NAME: string }>
    if (!hasScopes?.length) return

    const hasTenants = (await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ['tenants']
    )) as Array<{ TABLE_NAME: string }>
    if (!hasTenants?.length) return

    await queryRunner.query(
      `UPDATE \`admin_scopes\` AS s
         INNER JOIN \`tenants\` AS t ON t.tenantId = s.tenantId AND t.deletedAt IS NULL AND t.type = 'SINGLE'
         INNER JOIN \`admin_scopes\` AS dup ON dup.userId = s.userId AND dup.tenantId = s.tenantId
              AND dup.role = 'TENANT_ADMIN' AND dup.status = 'ACTIVE' AND dup.deletedAt IS NULL
         SET s.deletedAt = CURRENT_TIMESTAMP(3)
         WHERE s.role = 'STORE_ADMIN' AND s.status = 'ACTIVE' AND s.deletedAt IS NULL`
    )

    await queryRunner.query(
      `UPDATE \`admin_scopes\` AS s
         INNER JOIN \`tenants\` AS t ON t.tenantId = s.tenantId AND t.deletedAt IS NULL AND t.type = 'SINGLE'
         SET s.role = 'TENANT_ADMIN', s.storeId = NULL
         WHERE s.role = 'STORE_ADMIN' AND s.status = 'ACTIVE' AND s.deletedAt IS NULL`
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
