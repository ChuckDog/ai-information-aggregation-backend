import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronJob } from 'cron';
import { Task } from './entities/task.entity';
import { TasksService } from './tasks.service';

@Injectable()
export class TaskSchedulingService implements OnModuleInit {
  private readonly logger = new Logger(TaskSchedulingService.name);

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => TasksService))
    private tasksService: TasksService,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {
    this.tasksService.setSchedulingService(this);
  }

  async onModuleInit() {
    this.logger.log('Initializing scheduled tasks...');
    await this.loadScheduledTasks();
  }

  async loadScheduledTasks() {
    const scheduledTasks = await this.tasksRepository.find({
      where: { isScheduled: true },
    });

    for (const task of scheduledTasks) {
      if (task.cronExpression) {
        this.addCronJob(task.id, task.cronExpression);
      }
    }
  }

  addCronJob(taskId: string, cronExpression: string) {
    const jobName = `task_${taskId}`;
    
    // Check if job already exists
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
        this.schedulerRegistry.deleteCronJob(jobName);
    }

    try {
        const job = new CronJob(cronExpression, async () => {
            this.logger.log(`Executing scheduled task: ${taskId}`);
            try {
                // Fetch the latest task to get userId
                const task = await this.tasksRepository.findOne({ where: { id: taskId } });
                if (task && task.isScheduled) {
                     // Provide a mock userPayload with the task's userId
                    await this.tasksService.execute(taskId, { sub: task.userId });
                } else {
                    // If task was deleted or unscheduled, remove the job
                    this.removeCronJob(taskId);
                }
            } catch (error) {
                this.logger.error(`Failed to execute scheduled task ${taskId}`, error);
            }
        });

        this.schedulerRegistry.addCronJob(jobName, job);
        job.start();
        this.logger.log(`Scheduled task ${taskId} with cron: ${cronExpression}`);
    } catch (e) {
        this.logger.error(`Invalid cron expression for task ${taskId}: ${cronExpression}`);
    }
  }

  removeCronJob(taskId: string) {
    const jobName = `task_${taskId}`;
    if (this.schedulerRegistry.doesExist('cron', jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
      this.logger.log(`Removed scheduled task ${taskId}`);
    }
  }
}
