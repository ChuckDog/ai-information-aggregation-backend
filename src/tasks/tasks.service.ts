import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { User } from '../users/entities/user.entity';
import { TaskResult } from './entities/task-result.entity';
import { CrawlStrategy } from './entities/crawl-strategy.entity';
import { AIService } from '../ai/ai.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectRepository(TaskResult)
    private taskResultsRepository: Repository<TaskResult>,
    @InjectRepository(CrawlStrategy)
    private crawlStrategyRepository: Repository<CrawlStrategy>,
    private aiService: AIService,
  ) {}

  async create(createTaskDto: CreateTaskDto, user: User): Promise<Task> {
    const task = this.tasksRepository.create({
      ...createTaskDto,
      user,
      userId: user.id,
      status: 'pending',
    });
    return this.tasksRepository.save(task);
  }

  async findAll(user: User): Promise<Task[]> {
    return this.tasksRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User): Promise<Task> {
    const task = await this.tasksRepository.findOne({
      where: { id, userId: user.id },
      relations: ['results', 'strategies'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    return task;
  }

  async getResults(id: string, user: User): Promise<TaskResult[]> {
    const task = await this.findOne(id, user);
    return this.taskResultsRepository.find({
      where: { taskId: task.id },
      order: { createdAt: 'DESC' },
    });
  }

  async execute(id: string, user: User): Promise<void> {
    const task = await this.findOne(id, user);

    if (task.status === 'running') {
      return;
    }

    task.status = 'running';
    task.executedAt = new Date();
    await this.tasksRepository.save(task);

    try {
      // 1. Generate Strategy with AI
      const strategyConfig = await this.aiService.generateStrategy(
        task.instructions,
        task.urls,
      );

      // 2. Save Strategy
      const strategy = this.crawlStrategyRepository.create({
        task,
        taskId: task.id,
        strategyConfig,
        description: strategyConfig.summary || 'AI Generated Strategy',
      });
      await this.crawlStrategyRepository.save(strategy);

      // TODO: 3. Add to Queue / Execute Crawler
      // For now, we just log it and maybe create a dummy result indicating strategy generation success

      /* 
           Real implementation would be:
           this.crawlerQueue.add('crawl', { strategyId: strategy.id, urls: task.urls });
        */
    } catch (error) {
      task.status = 'failed';
      await this.tasksRepository.save(task);

      const result = this.taskResultsRepository.create({
        task,
        taskId: task.id,
        status: 'failed',
        data: {},
        errorMessage: error.message,
      });
      await this.taskResultsRepository.save(result);

      throw error;
    }
  }
}
