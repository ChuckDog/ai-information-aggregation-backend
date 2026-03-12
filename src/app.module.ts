import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AIModule } from './ai/ai.module';
import { CrawlerModule } from './crawler/crawler.module';
import { User } from './users/entities/user.entity';
import { Task } from './tasks/entities/task.entity';
import { TaskResult } from './tasks/entities/task-result.entity';
import { CrawlStrategy } from './tasks/entities/crawl-strategy.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>(
          'DB_NAME',
          'information_aggregation',
        ),
        entities: [User, Task, TaskResult, CrawlStrategy],
        synchronize: true, // Auto-create tables (dev only)
      }),
    }),
    AuthModule,
    TasksModule,
    UsersModule,
    AIModule,
    CrawlerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
