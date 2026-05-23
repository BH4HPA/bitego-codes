import { MigrationInterface, QueryRunner } from 'typeorm'

export class OrderStatusLogs1770000015000 implements MigrationInterface {
  name = 'OrderStatusLogs1770000015000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS order_status_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        log_id VARCHAR(64) NOT NULL,
        order_id VARCHAR(32) NOT NULL,
        store_id VARCHAR(32) NOT NULL,
        from_status VARCHAR(20) NULL,
        to_status VARCHAR(20) NOT NULL,
        reason VARCHAR(255) NULL,
        remark VARCHAR(255) NULL,
        changed_by_user_id VARCHAR(32) NULL,
        changed_by_user_role VARCHAR(20) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        deleted_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_order_status_logs_log_id (log_id),
        KEY idx_order_status_logs_order_id (order_id),
        KEY idx_order_status_logs_store_id (store_id),
        KEY idx_order_status_logs_changed_by_user_id (changed_by_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS order_status_logs`)
  }
}
