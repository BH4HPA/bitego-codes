import { MigrationInterface, QueryRunner } from 'typeorm'

export class GoodImageUrls1770000003000 implements MigrationInterface {
  name = 'GoodImageUrls1770000003000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['goods', 'image_urls']
    )) as Array<{ DATA_TYPE: string }>
    if (!rows?.length) {
      await queryRunner.query('ALTER TABLE `goods` ADD COLUMN `image_urls` LONGTEXT DEFAULT NULL')
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
