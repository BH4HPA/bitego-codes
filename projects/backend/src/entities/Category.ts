import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('categories')
export class Category extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  categoryId: string

  @Column({ type: 'varchar', length: 32 })
  storeId: string

  @Index()
  @Column({ type: 'varchar', length: 32, nullable: true })
  templateId: string | null

  @Index()
  @Column({ type: 'varchar', length: 100 })
  name: string

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  subtitle: string | null

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  badgeText: string | null

  @Column({ type: 'int', default: 0 })
  sort: number

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string
}
