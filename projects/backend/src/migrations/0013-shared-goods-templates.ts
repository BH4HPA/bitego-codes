import { MigrationInterface, QueryRunner } from 'typeorm'

export class SharedGoodsTemplates1770000013000 implements MigrationInterface {
  name = 'SharedGoodsTemplates1770000013000'

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
        `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
      )) as Array<{ DATA_TYPE: string }>
      return Boolean(rows?.length)
    }

    if (await table('goods')) {
      if (!(await col('goods', 'templateId'))) {
        await queryRunner.query('ALTER TABLE `goods` ADD COLUMN `templateId` VARCHAR(32) NULL')
        await queryRunner.query('CREATE INDEX `IDX_goods_templateId` ON `goods` (`templateId`)')
        await queryRunner.query('UPDATE `goods` SET `templateId` = `goodId` WHERE `templateId` IS NULL')
      }
    }

    if (await table('spec_groups')) {
      if (!(await col('spec_groups', 'templateId'))) {
        await queryRunner.query('ALTER TABLE `spec_groups` ADD COLUMN `templateId` VARCHAR(32) NULL')
        await queryRunner.query('CREATE INDEX `IDX_spec_groups_templateId` ON `spec_groups` (`templateId`)')
        await queryRunner.query('UPDATE `spec_groups` SET `templateId` = `specGroupId` WHERE `templateId` IS NULL')
      }
    }

    if (await table('spec_options')) {
      if (!(await col('spec_options', 'templateId'))) {
        await queryRunner.query('ALTER TABLE `spec_options` ADD COLUMN `templateId` VARCHAR(32) NULL')
        await queryRunner.query('CREATE INDEX `IDX_spec_options_templateId` ON `spec_options` (`templateId`)')
        await queryRunner.query('UPDATE `spec_options` SET `templateId` = `optionId` WHERE `templateId` IS NULL')
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
