import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('order_status_logs')
export class OrderStatusLog extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  logId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  orderId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Column({ type: 'varchar', length: 20, nullable: true })
  fromStatus: string | null

  @Column({ type: 'varchar', length: 20 })
  toStatus: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  changedByUserId: string | null

  @Column({ type: 'varchar', length: 20, nullable: true })
  changedByUserRole: string | null
}
