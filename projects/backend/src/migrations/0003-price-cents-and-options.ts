import { MigrationInterface, QueryRunner } from 'typeorm'

type ColInfo = { DATA_TYPE: string }

async function getDataType(queryRunner: QueryRunner, table: string, column: string) {
  const rows = (await queryRunner.query(
    `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )) as ColInfo[]
  return rows?.[0]?.DATA_TYPE || null
}

async function hasColumn(queryRunner: QueryRunner, table: string, column: string) {
  const t = await getDataType(queryRunner, table, column)
  return Boolean(t)
}

async function dropColumnIfExists(queryRunner: QueryRunner, table: string, column: string) {
  const exists = await hasColumn(queryRunner, table, column)
  if (exists) await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``)
}

async function ensureColumn(queryRunner: QueryRunner, table: string, ddl: string) {
  const match = ddl.match(/ADD COLUMN\s+`?([a-zA-Z0-9_]+)`?\s+/i)
  const col = match?.[1]
  if (!col) {
    await queryRunner.query(`ALTER TABLE \`${table}\` ${ddl}`)
    return
  }
  const exists = await hasColumn(queryRunner, table, col)
  if (!exists) await queryRunner.query(`ALTER TABLE \`${table}\` ${ddl}`)
}

async function convertDecimalYuanToBigintCents(queryRunner: QueryRunner, table: string, column: string) {
  const dt = await getDataType(queryRunner, table, column)
  if (!dt) return
  if (dt === 'bigint') return
  const tmp = `${column}__cents`
  await ensureColumn(queryRunner, table, `ADD COLUMN \`${tmp}\` BIGINT NOT NULL DEFAULT 0`)
  await queryRunner.query(`UPDATE \`${table}\` SET \`${tmp}\` = ROUND(\`${column}\` * 100)`)
  await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``)
  await queryRunner.query(`ALTER TABLE \`${table}\` CHANGE \`${tmp}\` \`${column}\` BIGINT NOT NULL DEFAULT 0`)
}

export class PriceCentsAndOptions1770000000000 implements MigrationInterface {
  name = 'PriceCentsAndOptions1770000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await convertDecimalYuanToBigintCents(queryRunner, 'skus', 'price')
    await convertDecimalYuanToBigintCents(queryRunner, 'orders', 'totalAmount')
    await convertDecimalYuanToBigintCents(queryRunner, 'orders', 'paidAmount')
    await convertDecimalYuanToBigintCents(queryRunner, 'orders', 'refundedAmount')
    await convertDecimalYuanToBigintCents(queryRunner, 'order_items', 'unitPriceSnapshot')
    await convertDecimalYuanToBigintCents(queryRunner, 'table_cart_items', 'unitPriceSnapshot')
    await convertDecimalYuanToBigintCents(queryRunner, 'payment_transactions', 'amount')
    await convertDecimalYuanToBigintCents(queryRunner, 'refund_transactions', 'amount')

    await ensureColumn(queryRunner, 'spec_groups', 'ADD COLUMN `isRequired` TINYINT NOT NULL DEFAULT 0')
    await ensureColumn(queryRunner, 'spec_groups', 'ADD COLUMN `minSelection` INT NOT NULL DEFAULT 0')
    await ensureColumn(queryRunner, 'spec_groups', 'ADD COLUMN `maxSelection` INT NOT NULL DEFAULT 0')
    await ensureColumn(queryRunner, 'spec_options', 'ADD COLUMN `priceCents` BIGINT NOT NULL DEFAULT 0')

    await dropColumnIfExists(queryRunner, 'goods', 'price')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT 1')
  }
}
