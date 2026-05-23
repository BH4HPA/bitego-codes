import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('good_shared_spec_groups')
@Index(['goodId', 'sharedSpecGroupId'], { unique: true })
export class GoodSharedSpecGroup extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Column({ type: 'varchar', length: 32 })
  goodId: string

  @Column({ type: 'varchar', length: 32 })
  sharedSpecGroupId: string

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'disabled_option_ids' })
  disabledOptionIds: string | null

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'default_option_ids' })
  defaultOptionIds: string | null

  @Column({ type: 'int', default: 0 })
  sort: number
}
