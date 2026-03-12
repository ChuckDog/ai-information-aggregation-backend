import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Body() createTaskDto: CreateTaskDto, @Request() req) {
    return this.tasksService.create(createTaskDto, req.user);
  }

  @Get()
  findAll(@Request() req) {
    return this.tasksService.findAll(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.tasksService.findOne(id, req.user);
  }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Request() req) {
    return this.tasksService.execute(id, req.user);
  }

  @Get(':id/results')
  getResults(@Param('id') id: string, @Request() req) {
    return this.tasksService.getResults(id, req.user);
  }
}
