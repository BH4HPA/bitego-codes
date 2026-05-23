import { MigrationInterface, QueryRunner } from 'typeorm'

export class SkuSpecSignature1770000004000 implements MigrationInterface {
  name = 'SkuSpecSignature1770000004000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const col = async (table: string, column: string) => {
      const rows = (await queryRunner.query(
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      )) as Array<{ DATA_TYPE: string }>
      return Boolean(rows?.length)
    }

    if (!(await col('skus', 'spec_key'))) {
      await queryRunner.query('ALTER TABLE `skus` ADD COLUMN `spec_key` VARCHAR(32) DEFAULT NULL')
      await queryRunner.query('CREATE INDEX `IDX_skus_spec_key` ON `skus` (`spec_key`)')
    }
    if (!(await col('skus', 'spec_signature'))) {
      await queryRunner.query('ALTER TABLE `skus` ADD COLUMN `spec_signature` VARCHAR(1024) DEFAULT NULL')
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
