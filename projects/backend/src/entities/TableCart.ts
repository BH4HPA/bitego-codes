import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('table_carts')
export class TableCart extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  cartId: string

  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Column({ type: 'varchar', length: 32 })
  tableId: string

  @Column({ type: 'int' })
  sessionVersion: number

  @Column({ type: 'int', default: 1 })
  version: number

  @Column({ type: 'datetime' })
  openedAt: Date
}
