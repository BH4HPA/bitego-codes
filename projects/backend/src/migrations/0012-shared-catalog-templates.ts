import { MigrationInterface, QueryRunner } from 'typeorm'

export class SharedCatalogTemplates1770000012000 implements MigrationInterface {
  name = 'SharedCatalogTemplates1770000012000'

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

    if (await table('categories')) {
      if (!(await col('categories', 'templateId'))) {
        await queryRunner.query('ALTER TABLE `categories` ADD COLUMN `templateId` VARCHAR(32) NULL')
        await queryRunner.query('CREATE INDEX `IDX_categories_templateId` ON `categories` (`templateId`)')
        await queryRunner.query('UPDATE `categories` SET `templateId` = `categoryId` WHERE `templateId` IS NULL')
      }
    }

    if (await table('shared_spec_groups')) {
      if (!(await col('shared_spec_groups', 'templateId'))) {
        await queryRunner.query('ALTER TABLE `shared_spec_groups` ADD COLUMN `templateId` VARCHAR(32) NULL')
        await queryRunner.query(
          'CREATE INDEX `IDX_shared_spec_groups_templateId` ON `shared_spec_groups` (`templateId`)'
        )
        await queryRunner.query(
          'UPDATE `shared_spec_groups` SET `templateId` = `sharedSpecGroupId` WHERE `templateId` IS NULL'
        )
      }
    }

    if (await table('shared_spec_options')) {
      if (!(await col('shared_spec_options', 'templateId'))) {
        await queryRunner.query('ALTER TABLE `shared_spec_options` ADD COLUMN `templateId` VARCHAR(32) NULL')
        await queryRunner.query(
          'CREATE INDEX `IDX_shared_spec_options_templateId` ON `shared_spec_options` (`templateId`)'
        )
        await queryRunner.query('UPDATE `shared_spec_options` SET `templateId` = `optionId` WHERE `templateId` IS NULL')
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
