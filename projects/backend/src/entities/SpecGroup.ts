import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('spec_groups')
export class SpecGroup extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  specGroupId: string

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  templateId: string | null

  @Column({ type: 'varchar', length: 32 })
  goodId: string

  @Column({ type: 'varchar', length: 50 })
  name: string

  @Column({ type: 'tinyint', default: 0 })
  isRequired: number

  @Column({ type: 'int', default: 0 })
  minSelection: number

  @Column({ type: 'int', default: 0 })
  maxSelection: number

  @Column({ type: 'int', default: 0 })
  sort: number

  @Column({ type: 'tinyint', default: 1 })
  isStock!: number

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'default_option_ids' })
  defaultOptionIds: string | null

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string
}
