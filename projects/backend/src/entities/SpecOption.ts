import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('spec_options')
export class SpecOption extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  optionId: string

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  templateId: string | null

  @Column({ type: 'varchar', length: 32 })
  specGroupId: string

  @Column({ type: 'varchar', length: 50 })
  name: string

  @Column({ type: 'bigint', default: 0 })
  priceCents: string

  @Column({ type: 'int', default: 0 })
  sort: number

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string
}
