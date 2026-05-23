import { MigrationInterface, QueryRunner } from 'typeorm'

export class GoodDropImageUrl1770000010000 implements MigrationInterface {
  name = 'GoodDropImageUrl1770000010000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const cols = (await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['goods', 'image_url']
    )) as Array<{ COLUMN_NAME: string }>
    if (!cols?.length) return

    await queryRunner.query(
      "UPDATE `goods` SET `image_urls` = JSON_ARRAY(`image_url`) WHERE (`image_urls` IS NULL OR `image_urls` = '' OR `image_urls` = '[]') AND `image_url` IS NOT NULL AND `image_url` <> ''"
    )
    await queryRunner.query('ALTER TABLE `goods` DROP COLUMN `image_url`')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
