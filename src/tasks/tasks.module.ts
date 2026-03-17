import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { TaskResult } from './entities/task-result.entity';
import { CrawlStrategy } from './entities/crawl-strategy.entity';
import { AIModule } from '../ai/ai.module';
import { CrawlerModule } from '../crawler/crawler.module';
import { TaskSchedulingService } from './task-scheduling.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskResult, CrawlStrategy]),
    AIModule,
    CrawlerModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskSchedulingService],
  exports: [TasksService],
})
export class TasksModule {}
