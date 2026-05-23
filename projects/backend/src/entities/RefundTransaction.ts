import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('refund_transactions')
export class RefundTransaction extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  refundId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  orderId: string

  @Column({ type: 'bigint', default: 0 })
  amount: string

  @Column({ type: 'varchar', length: 20 })
  status: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null

  @Column({ type: 'datetime' })
  requestedAt: Date

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  reviewedByUserId: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  reviewRejectReason: string | null

  @Column({ type: 'datetime', nullable: true })
  succeededAt: Date | null
}
