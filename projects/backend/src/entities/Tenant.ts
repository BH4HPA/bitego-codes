import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('tenants')
export class Tenant extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  tenantId: string

  @Column({ type: 'varchar', length: 20, default: 'SINGLE' })
  type: 'SINGLE' | 'CHAIN'

  @Column({ type: 'varchar', length: 100 })
  brandName: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  brandLogoUrl: string | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  primaryStoreId: string | null

  @Column({ type: 'bigint', nullable: true })
  lastSyncedChangeId: string | null

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt: Date | null

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string
}
