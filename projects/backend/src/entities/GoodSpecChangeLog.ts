import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

@Entity('good_spec_change_logs')
export class GoodSpecChangeLog {
  @PrimaryGeneratedColumn()
  id!: number

  @Index()
  @Column({ type: 'varchar', length: 64 })
  goodId!: string

  @Column({ type: 'varchar', length: 32 })
  operatorRole!: string

  @Column({ type: 'varchar', length: 64 })
  operatorUserId!: string

  @Column({ type: 'longtext' })
  beforeSnapshot!: string

  @Column({ type: 'longtext' })
  afterSnapshot!: string

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date
}
