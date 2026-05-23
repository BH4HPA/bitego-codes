import { MigrationInterface, QueryRunner } from 'typeorm'

export class TableH5QrcodeUrl1770000018000 implements MigrationInterface {
  name = 'TableH5QrcodeUrl1770000018000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = async (tableName: string) => {
      const rows = (await queryRunner.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      )) as Array<{ TABLE_NAME: string }>
      return Boolean(rows?.length)
    }

    const col = async (tableName: string, columnName: string) => {
      const rows = (await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
      )) as Array<{ COLUMN_NAME: string }>
      return Boolean(rows?.length)
    }

    if (!(await table('tables'))) return
    if (await col('tables', 'h5_qrcode_url')) return

    await queryRunner.query('ALTER TABLE `tables` ADD COLUMN `h5_qrcode_url` VARCHAR(512) NULL')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = async (tableName: string) => {
      const rows = (await queryRunner.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      )) as Array<{ TABLE_NAME: string }>
      return Boolean(rows?.length)
    }

    const col = async (tableName: string, columnName: string) => {
      const rows = (await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
      )) as Array<{ COLUMN_NAME: string }>
      return Boolean(rows?.length)
    }

    if (!(await table('tables'))) return
    if (!(await col('tables', 'h5_qrcode_url'))) return

    await queryRunner.query('ALTER TABLE `tables` DROP COLUMN `h5_qrcode_url`')
  }
}
