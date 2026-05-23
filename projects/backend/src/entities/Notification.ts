import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity({ name: 'notifications' })
export class Notification extends BaseColumns {
  @PrimaryGeneratedColumn()
  id!: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  notificationId!: string

  @Column({ type: 'varchar', length: 64 })
  type!: string

  @Column({ type: 'varchar', length: 200 })
  title!: string

  @Column({ type: 'varchar', length: 500 })
  message!: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  orderId!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  tableId!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  tableCode!: string | null

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  tenantId!: string | null

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  storeId!: string | null

  @Column({ type: 'varchar', length: 16, default: 'UNREAD' })
  status!: 'UNREAD' | 'READ' | 'HANDLED'

  @Column({ type: 'datetime', nullable: true })
  readAt!: Date | null

  @Column({ type: 'datetime', nullable: true })
  handledAt!: Date | null

  @Column({ type: 'simple-json', nullable: true })
  payload!: unknown
}
