import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('payment_transactions')
export class PaymentTransaction extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  paymentId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  orderId: string

  @Column({ type: 'varchar', length: 20 })
  paymentMethod: string

  @Column({ type: 'bigint', default: 0 })
  amount: string

  @Column({ type: 'varchar', length: 20 })
  status: string

  @Column({ type: 'datetime' })
  requestedAt: Date

  @Column({ type: 'datetime', nullable: true })
  succeededAt: Date | null
}
