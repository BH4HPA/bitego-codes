import { MigrationInterface, QueryRunner } from 'typeorm'

export class GoodDropZombieImageUrl1771000000000 implements MigrationInterface {
  name = 'GoodDropZombieImageUrl1771000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const present = (await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?, ?)`,
      ['goods', 'imageUrl', 'image_urls']
    )) as Array<{ COLUMN_NAME: string }>
    const cols = new Set(present.map((r) => r.COLUMN_NAME))
    if (!cols.has('imageUrl')) return

    if (cols.has('image_urls')) {
      await queryRunner.query(
        "UPDATE `goods` SET `image_urls` = JSON_ARRAY(`imageUrl`) WHERE (`image_urls` IS NULL OR `image_urls` = '' OR `image_urls` = '[]') AND `imageUrl` IS NOT NULL AND `imageUrl` <> ''"
      )
    }
    await queryRunner.query('ALTER TABLE `goods` DROP COLUMN `imageUrl`')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
