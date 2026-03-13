import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Task } from './task.entity';

@Entity('crawl_strategies')
export class CrawlStrategy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', nullable: true }) // Allow nullable temporarily to fix the issue or verify if it helps
  taskId: string;

  @ManyToOne(() => Task, (task) => task.strategies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column('jsonb', { name: 'strategy_config' })
  strategyConfig: any;

  @Column('text', { nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
