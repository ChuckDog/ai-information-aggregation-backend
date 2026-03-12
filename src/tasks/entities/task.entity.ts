import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  name: string;

  @Column('text', { array: true, nullable: true })
  urls: string[];

  @Column({ nullable: true })
  keywords: string;

  @Column('text')
  instructions: string;

  @Column('jsonb', { default: {} })
  config: Record<string, any>;

  @Column({ default: 'pending' })
  status: string; // 'pending' | 'running' | 'completed' | 'failed'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'executed_at', nullable: true })
  executedAt: Date;

  @OneToMany('TaskResult', 'task')
  results: any[];

  @OneToMany('CrawlStrategy', 'task')
  strategies: any[];
}
