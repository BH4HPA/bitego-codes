import { MigrationInterface, QueryRunner } from 'typeorm'

export class Smoke1700000000000 implements MigrationInterface {
  name = 'Smoke1700000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `schema_migrations_smoke` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `schema_migrations_smoke`')
  }
}
