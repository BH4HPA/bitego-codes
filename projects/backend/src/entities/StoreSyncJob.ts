import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('store_sync_jobs')
export class StoreSyncJob extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  jobId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  tenantId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  sourceStoreId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  targetStoreId: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  kind: string

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  batchId: string | null

  @Column({ type: 'bigint', nullable: true })
  upToChangeId: string | null

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

  @Column({ type: 'simple-json', nullable: true })
  payload: unknown

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null
}
