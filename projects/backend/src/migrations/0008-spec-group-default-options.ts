import { MigrationInterface, QueryRunner } from 'typeorm'

export class SpecGroupDefaultOptions1770000008000 implements MigrationInterface {
  name = 'SpecGroupDefaultOptions1770000008000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const col = async (table: string, column: string) => {
      const rows = (await queryRunner.query(
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      )) as Array<{ DATA_TYPE: string }>
      return Boolean(rows?.length)
    }

    if (!(await col('spec_groups', 'default_option_ids'))) {
      await queryRunner.query('ALTER TABLE `spec_groups` ADD COLUMN `default_option_ids` VARCHAR(1024) DEFAULT NULL')
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
