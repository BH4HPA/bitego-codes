import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('tables')
export class Table extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  tableId: string

  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Index()
  @Column({ type: 'varchar', length: 20 })
  code: string

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'FREE' })
  status: string

  @Column({ type: 'int', default: 1 })
  sessionVersion: number

  @Column({ type: 'datetime', nullable: true })
  sessionClosedAt: Date | null

  @Column({ type: 'varchar', name: 'qrcode_url', length: 512, nullable: true })
  qrcodeUrl: string | null

  @Column({ type: 'varchar', name: 'h5_qrcode_url', length: 512, nullable: true })
  h5QrcodeUrl: string | null
}
