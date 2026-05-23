import { MigrationInterface, QueryRunner } from 'typeorm'

export class TableQrcodeUrl1770000002000 implements MigrationInterface {
  name = 'TableQrcodeUrl1770000002000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['tables', 'qrcode_url']
    )) as Array<{ DATA_TYPE: string }>
    if (!rows?.length) {
      await queryRunner.query('ALTER TABLE `tables` ADD COLUMN `qrcode_url` VARCHAR(512) DEFAULT NULL')
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
