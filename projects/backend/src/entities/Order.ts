import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('orders')
export class Order extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  orderId: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  orderNo: string

  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Column({ type: 'varchar', length: 32, nullable: true })
  tableId: string

  @Column({ type: 'int', nullable: true })
  tableSessionVersion: number

  @Column({ type: 'varchar', length: 32 })
  userId: string

  @Index()
  @Column({ type: 'varchar', length: 20 })
  status: string

  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentMethod: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string

  @Column({ type: 'bigint', default: 0 })
  totalAmount: string

  @Column({ type: 'bigint', nullable: true })
  paidAmount: string | null

  @Column({ type: 'bigint', nullable: true })
  refundedAmount: string | null

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date | null

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null

  @Column({ type: 'datetime', nullable: true })
  canceledAt: Date | null

  @Column({ type: 'datetime', nullable: true })
  refundedAt: Date | null
}
