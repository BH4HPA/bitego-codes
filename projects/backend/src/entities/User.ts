import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm'
import { BaseColumns } from './BaseColumns'

@Entity('users')
export class User extends BaseColumns {
  @PrimaryGeneratedColumn()
  id: number

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  userId: string

  @Index()
  @Column({ type: 'varchar', length: 20 })
  userType: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  username: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  wechatOpenid: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  wechatUnionid: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  nickname: string | null

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null

  @Column({ type: 'varchar', length: 30, nullable: true })
  phoneNumber: string | null

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date | null
}
