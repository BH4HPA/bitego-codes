import { MigrationInterface, QueryRunner } from 'typeorm'

export class GoodCategorySort1770000009000 implements MigrationInterface {
  name = 'GoodCategorySort1770000009000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const col = async (table: string, column: string) => {
      const rows = (await queryRunner.query(
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      )) as Array<{ DATA_TYPE: string }>
      return Boolean(rows?.length)
    }

    if (!(await col('good_categories', 'sort'))) {
      await queryRunner.query('ALTER TABLE `good_categories` ADD COLUMN `sort` INT NOT NULL DEFAULT 0')
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
