import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResult } from './entities/task-result.entity';
import { CrawlStrategy } from './entities/crawl-strategy.entity';
import { AIService } from '../ai/ai.service';
import { CrawlerService } from '../crawler/crawler.service';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';

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
    private crawlerService: CrawlerService,
  ) {}

  async create(createTaskDto: CreateTaskDto, userPayload: any): Promise<Task> {
    const userId = userPayload.sub || userPayload.id;
    const task = this.tasksRepository.create({
      ...createTaskDto,
      userId: userId,
      status: 'pending',
      progress: 0,
    });
    return this.tasksRepository.save(task);
  }

  async findAll(userPayload: any): Promise<Task[]> {
    const userId = userPayload.sub || userPayload.id;
    return this.tasksRepository.find({
      where: { userId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userPayload: any): Promise<Task> {
    const userId = userPayload.sub || userPayload.id;
    // We need to order results by createdAt DESC to ensure frontend gets latest first
    // TypeORM relations option doesn't support ordering easily in findOne
    // So we use query builder or separate queries, but findOne with relations loads them.
    // The default order of relation load is usually PK ASC.

    const task = await this.tasksRepository.findOne({
      where: { id, userId: userId },
      relations: ['strategies'], // Load strategies
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    // Load results separately with correct ordering
    task.results = await this.taskResultsRepository.find({
      where: { taskId: id },
      order: { createdAt: 'DESC' },
    });

    return task;
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    userPayload: any,
  ): Promise<Task> {
    const task = await this.findOne(id, userPayload);

    // Only allow updating non-running tasks or basic info
    if (task.status === 'running') {
      // Optional: restrict updates while running
    }

    Object.assign(task, updateTaskDto);
    return this.tasksRepository.save(task);
  }

  async remove(id: string, userPayload: any): Promise<void> {
    const task = await this.findOne(id, userPayload);
    await this.tasksRepository.remove(task);
  }

  async getResults(id: string, userPayload: any): Promise<TaskResult[]> {
    const task = await this.findOne(id, userPayload);
    // This is already ordered in findOne now, but explicit is good
    return this.taskResultsRepository.find({
      where: { taskId: task.id },
      order: { createdAt: 'DESC' },
    });
  }

  async exportResults(
    id: string,
    format: string,
    userPayload: any,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const task = await this.findOne(id, userPayload);
    const results = await this.taskResultsRepository.find({
      where: { taskId: task.id },
      order: { createdAt: 'DESC' },
    });

    // Flatten results for Excel/CSV if possible
    // Extract all unique keys from data
    const flattenedData = [];
    results.forEach((r) => {
      const data = r.data || {};
      if (data.type === 'list_crawl' && Array.isArray(data.items)) {
        data.items.forEach((item) => {
          flattenedData.push({
            ...item,
            _source_url: data.url,
            _crawled_at: r.createdAt,
          });
        });
      } else {
        flattenedData.push({
          ...data,
          _crawled_at: r.createdAt,
        });
      }
    });

    if (format === 'excel' || format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Results');

      // Get all unique keys
      const keys = new Set<string>();
      flattenedData.forEach((item) =>
        Object.keys(item).forEach((k) => keys.add(k)),
      );
      const columns = Array.from(keys).map((k) => ({ header: k, key: k }));

      worksheet.columns = columns;
      worksheet.addRows(flattenedData);

      const buffer = (await workbook.xlsx.writeBuffer()) as any as Buffer;
      return {
        buffer,
        filename: `task-${id}-export.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else if (format === 'pdf') {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve({
            buffer: pdfData,
            filename: `task-${id}-export.pdf`,
            contentType: 'application/pdf',
          });
        });

        // Try to load a font that supports Chinese characters
        const fontPaths = [
          '/System/Library/Fonts/Supplemental/Arial Unicode.ttf', // macOS
          '/System/Library/Fonts/PingFang.ttc', // macOS (might need index)
          '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', // Linux common
          '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
          path.join(process.cwd(), 'fonts', 'Arial Unicode.ttf'), // Project local
        ];

        let fontLoaded = false;
        for (const fontPath of fontPaths) {
          if (fs.existsSync(fontPath)) {
            try {
              // For TTC files, we might need to specify a font name, but let's try path first
              // If it fails, pdfkit will throw, so we catch it.
              doc.font(fontPath);
              fontLoaded = true;
              break;
            } catch (e) {
              console.warn(`Failed to load font from ${fontPath}:`, e.message);
            }
          }
        }

        if (!fontLoaded) {
          console.warn(
            'No suitable Chinese font found. Text might be garbled.',
          );
        }

        // Add content to PDF
        doc.fontSize(20).text(`Task Export: ${task.name}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Date: ${new Date().toLocaleString()}`);
        doc.moveDown();

        flattenedData.forEach((item, index) => {
          doc
            .fontSize(14)
            .text(`${index + 1}. ${item.title || 'Item'}`, { underline: true });
          doc.fontSize(10).text(`Source: ${item.url || item._source_url}`);
          doc.moveDown(0.5);

          if (item.content) {
            doc.text(
              item.content.substring(0, 1000) +
                (item.content.length > 1000 ? '...' : ''),
            );
          }

          doc.moveDown();
          // Print other fields
          Object.entries(item).forEach(([k, v]) => {
            if (!['title', 'content', 'url', '_source_url'].includes(k)) {
              doc.text(`${k}: ${v}`);
            }
          });
          doc.moveDown();
          doc.moveTo(doc.x, doc.y).lineTo(500, doc.y).stroke();
          doc.moveDown();
        });

        doc.end();
      });
    } else {
      // Default MD
      let markdown = `# Task Export: ${task.name}\n\n`;
      markdown += `**Date:** ${new Date().toLocaleString()}\n`;
      markdown += `**Instructions:** ${task.instructions}\n`;
      markdown += `**Source URLs:**\n${task.urls
        .map((u) => `- ${u}`)
        .join('\n')}\n\n`;
      markdown += `---\n\n`;

      for (const result of results) {
        const data = result.data || {};
        markdown += `## ${data.title || 'Result Item'}\n\n`;
        markdown += `**Source:** ${data.url}\n`;
        markdown += `**Time:** ${new Date(
          result.createdAt,
        ).toLocaleString()}\n\n`;

        if (data.summary) {
          markdown += `### Summary\n${data.summary}\n\n`;
        }

        if (data.content) {
          markdown += `### Content\n${data.content}\n\n`;
        }

        // Handle List Crawl Items
        if (data.type === 'list_crawl' && Array.isArray(data.items)) {
          markdown += `### Extracted List Items (${data.items.length})\n\n`;
          data.items.forEach((item, idx) => {
            markdown += `#### ${idx + 1}. ${item.title || 'Untitled'}\n`;
            markdown += `**Link:** ${item.url}\n`;
            if (item.content) {
              markdown += `> ${item.content.replace(/\n/g, '\n> ')}\n\n`;
            }
            // Other fields
            Object.entries(item).forEach(([k, v]) => {
              if (!['title', 'url', 'content', 'timestamp'].includes(k)) {
                markdown += `- **${k}:** ${v}\n`;
              }
            });
            markdown += `\n`;
          });
        } else {
          // Other generic fields
          Object.entries(data).forEach(([k, v]) => {
            if (
              !['title', 'url', 'content', 'summary', 'type', 'items'].includes(
                k,
              )
            ) {
              markdown += `- **${k}:** ${
                typeof v === 'object' ? JSON.stringify(v) : v
              }\n`;
            }
          });
        }

        markdown += `\n---\n\n`;
      }
      return {
        buffer: Buffer.from(markdown),
        filename: `task-${id}-export.md`,
        contentType: 'text/markdown',
      };
    }
  }

  async clearResults(id: string, userPayload: any): Promise<void> {
    const task = await this.findOne(id, userPayload);
    await this.taskResultsRepository.delete({ taskId: task.id });
  }

  async deleteResult(
    taskId: string,
    resultId: string,
    userPayload: any,
  ): Promise<void> {
    const task = await this.findOne(taskId, userPayload);
    // Ensure the result belongs to the task (and implicitly the user via findOne)
    const result = await this.taskResultsRepository.findOne({
      where: { id: resultId, taskId: task.id },
    });
    if (!result) {
      throw new NotFoundException(`Result not found`);
    }
    await this.taskResultsRepository.remove(result);
  }

  async execute(id: string, userPayload: any): Promise<void> {
    const task = await this.findOne(id, userPayload);

    if (task.status === 'running') {
      return;
    }

    if (task.status === 'paused') {
      task.status = 'running';
      await this.tasksRepository.save(task);
      this.runTaskBackground(task);
      return;
    }

    // Reset task state for new execution
    task.status = 'running';
    task.progress = 0;
    task.current_step = 'Starting task...';
    task.executedAt = new Date();
    // Clear old results if needed, or keep them. Let's keep them for history but maybe mark new execution

    await this.tasksRepository.save(task);

    // Run execution in background
    this.runTaskBackground(task);
  }

  async restart(id: string, userPayload: any): Promise<void> {
    const task = await this.findOne(id, userPayload);

    // Stop current if running (though shouldStop checks status)
    task.status = 'pending';
    await this.tasksRepository.save(task);

    // Clear previous results? Optional.
    // await this.taskResultsRepository.delete({ taskId: id });

    // Execute again
    await this.execute(id, userPayload);
  }

  async pause(id: string, userPayload: any): Promise<void> {
    const task = await this.findOne(id, userPayload);
    if (task.status === 'running') {
      task.status = 'paused';
      await this.tasksRepository.save(task);
    }
  }

  private async runTaskBackground(task: Task) {
    // Re-fetch task to ensure we have a fresh entity tracked by TypeORM
    // This is crucial for long-running async processes where the original 'task' object might become detached
    const freshTask = await this.tasksRepository.findOne({
      where: { id: task.id },
    });
    if (!freshTask) return; // Should not happen

    try {
      // Check for pause
      if (await this.shouldStop(freshTask.id)) return;

      freshTask.status = 'running';
      freshTask.progress = 10;
      freshTask.current_step = 'Initializing AI strategy...';
      await this.tasksRepository.save(freshTask);

      // 1. Generate Strategy with AI
      freshTask.progress = 20;
      freshTask.current_step =
        'Analyzing requirements and generating crawl strategy (this may take a few seconds)...';
      await this.tasksRepository.save(freshTask);

      const strategyConfig = await this.aiService.generateStrategy(
        freshTask.instructions,
        freshTask.urls,
      );

      // Save AI insights to task for immediate feedback
      if (strategyConfig.keywords_filter) {
        freshTask.keywords = strategyConfig.keywords_filter.join(', ');
      }
      // Update progress
      freshTask.progress = 30;
      freshTask.current_step = 'Strategy generated. Saving configuration...';
      await this.tasksRepository.save(freshTask);

      // 2. Save Strategy
      // Create new instance without relation object first to avoid circular/detached issues
      // Important: Use 'create' with a plain object including taskId, then save.
      // Do NOT attach the full 'task' entity if it causes circular updates or validation issues.
      const strategy = this.crawlStrategyRepository.create({
        taskId: freshTask.id,
        strategyConfig,
        description: strategyConfig.summary || 'AI Generated Strategy',
      });
      // Explicitly set task relation to null to force TypeORM to use taskId only
      strategy.task = undefined as any;

      // Save strategy first (using foreign key ID)
      await this.crawlStrategyRepository.save(strategy);

      if (await this.shouldStop(freshTask.id)) return;

      freshTask.progress = 40;
      freshTask.current_step = 'Starting crawling process...';
      await this.tasksRepository.save(freshTask);

      // 3. Execute Crawler for each URL
      for (let i = 0; i < freshTask.urls.length; i++) {
        if (await this.shouldStop(freshTask.id)) return;

        const url = freshTask.urls[i];
        // Calculate progress more smoothly: 40% -> 90%
        const urlProgress = Math.floor(40 + (i / freshTask.urls.length) * 50);
        freshTask.progress = urlProgress;
        freshTask.current_step = `Crawling: ${url}`;
        await this.tasksRepository.save(freshTask);

        try {
          // Perform actual crawling using the generated strategy
          const extractedData = await this.crawlerService.crawl(
            url,
            strategyConfig,
          );

          // Save Result
          const result = this.taskResultsRepository.create({
            taskId: freshTask.id,
            data: extractedData,
            status: 'completed',
          });
          // Explicitly set task relation to undefined
          result.task = undefined as any;

          await this.taskResultsRepository.save(result);

          // Update progress after successful crawl
          const postUrlProgress = Math.floor(
            40 + ((i + 1) / freshTask.urls.length) * 50,
          );
          freshTask.progress = postUrlProgress;
          await this.tasksRepository.save(freshTask);
        } catch (crawlError) {
          // Log error but continue with other URLs
          const result = this.taskResultsRepository.create({
            taskId: freshTask.id,
            data: { url },
            status: 'failed',
            errorMessage: crawlError.message,
          });
          // Explicitly set task relation to undefined
          result.task = undefined as any;
          await this.taskResultsRepository.save(result);
        }
      }

      freshTask.status = 'completed';
      freshTask.progress = 100;
      freshTask.current_step = 'Task completed successfully.';
      await this.tasksRepository.save(freshTask);
    } catch (error) {
      freshTask.status = 'failed';
      freshTask.progress = 100;
      freshTask.current_step = `Error: ${error.message}`;
      await this.tasksRepository.save(freshTask);

      const result = this.taskResultsRepository.create({
        taskId: freshTask.id,
        data: {},
        status: 'failed',
        errorMessage: error.message,
      });
      // Explicitly set task relation to undefined
      result.task = undefined as any;
      await this.taskResultsRepository.save(result);
    }
  }

  private async shouldStop(taskId: string): Promise<boolean> {
    const currentTask = await this.tasksRepository.findOne({
      where: { id: taskId },
    });
    return currentTask.status !== 'running';
  }
}
