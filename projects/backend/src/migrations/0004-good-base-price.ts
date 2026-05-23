import { MigrationInterface, QueryRunner } from 'typeorm'

export class GoodBasePrice1770000001000 implements MigrationInterface {
  name = 'GoodBasePrice1770000001000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['goods', 'basePrice']
    )) as Array<{ DATA_TYPE: string }>
    if (!rows?.length) {
      await queryRunner.query('ALTER TABLE `goods` ADD COLUMN `basePrice` BIGINT NOT NULL DEFAULT 0')
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
