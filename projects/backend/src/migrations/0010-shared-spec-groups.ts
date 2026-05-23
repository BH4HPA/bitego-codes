import { MigrationInterface, QueryRunner } from 'typeorm'

export class SharedSpecGroups1770000010000 implements MigrationInterface {
  name = 'SharedSpecGroups1770000010000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const exists = async (table: string) => {
      const rows = (await queryRunner.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      )) as Array<{ TABLE_NAME: string }>
      return Boolean(rows?.length)
    }

    if (!(await exists('shared_spec_groups'))) {
      await queryRunner.query(`CREATE TABLE \`shared_spec_groups\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`store_id\` VARCHAR(32) NOT NULL,
  \`shared_spec_group_id\` VARCHAR(32) NOT NULL,
  \`name\` VARCHAR(50) NOT NULL,
  \`is_required\` TINYINT NOT NULL DEFAULT 0,
  \`min_selection\` INT NOT NULL DEFAULT 0,
  \`max_selection\` INT NOT NULL DEFAULT 0,
  \`sort\` INT NOT NULL DEFAULT 0,
  \`default_option_ids\` VARCHAR(1024) NULL,
  \`status\` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  \`deleted_at\` DATETIME(3) DEFAULT NULL,
  UNIQUE KEY \`uk_shared_spec_group_id\` (\`shared_spec_group_id\`),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }

    if (!(await exists('shared_spec_options'))) {
      await queryRunner.query(`CREATE TABLE \`shared_spec_options\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`option_id\` VARCHAR(32) NOT NULL,
  \`shared_spec_group_id\` VARCHAR(32) NOT NULL,
  \`name\` VARCHAR(50) NOT NULL,
  \`price_cents\` BIGINT NOT NULL DEFAULT 0,
  \`sort\` INT NOT NULL DEFAULT 0,
  \`status\` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  \`deleted_at\` DATETIME(3) DEFAULT NULL,
  UNIQUE KEY \`uk_shared_spec_option_id\` (\`option_id\`),
  KEY \`idx_shared_spec_group_id\` (\`shared_spec_group_id\`),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }

    if (!(await exists('good_shared_spec_groups'))) {
      await queryRunner.query(`CREATE TABLE \`good_shared_spec_groups\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`store_id\` VARCHAR(32) NOT NULL,
  \`good_id\` VARCHAR(32) NOT NULL,
  \`shared_spec_group_id\` VARCHAR(32) NOT NULL,
  \`sort\` INT NOT NULL DEFAULT 0,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  \`deleted_at\` DATETIME(3) DEFAULT NULL,
  UNIQUE KEY \`uk_good_shared_spec_group\` (\`good_id\`, \`shared_spec_group_id\`),
  KEY \`idx_good_shared_spec_group_id\` (\`shared_spec_group_id\`),
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`)
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
