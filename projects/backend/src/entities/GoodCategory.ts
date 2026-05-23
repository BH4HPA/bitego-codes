import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('good_categories')
@Index(['goodId', 'categoryId'], { unique: true })
export class GoodCategory extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Column({ type: 'varchar', length: 32 })
  goodId: string

  @Column({ type: 'varchar', length: 32 })
  categoryId: string

  @Column({ type: 'int', default: 0 })
  sort: number
}
