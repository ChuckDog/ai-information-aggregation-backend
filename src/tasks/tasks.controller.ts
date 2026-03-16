import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Header,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
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

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Request() req,
  ) {
    return this.tasksService.update(id, updateTaskDto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.tasksService.remove(id, req.user);
  }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Request() req) {
    return this.tasksService.execute(id, req.user);
  }

  @Post(':id/pause')
  pause(@Param('id') id: string, @Request() req) {
    return this.tasksService.pause(id, req.user);
  }

  @Post(':id/stop')
  stop(@Param('id') id: string, @Request() req) {
    return this.tasksService.stop(id, req.user);
  }

  @Post(':id/structure')
  structure(
    @Param('id') id: string,
    @Body() body: { structuringInstructions?: string },
    @Request() req,
  ) {
    return this.tasksService.structureResults(
      id,
      req.user,
      body.structuringInstructions,
    );
  }

  @Post(':id/restart')
  restart(@Param('id') id: string, @Request() req) {
    return this.tasksService.restart(id, req.user);
  }

  @Get(':id/results')
  getResults(@Param('id') id: string, @Request() req) {
    return this.tasksService.getResults(id, req.user);
  }

  @Get(':id/export')
  async exportResults(
    @Param('id') id: string,
    @Query('format') format = 'md',
    @Request() req,
    @Res() res: Response,
  ) {
    const { buffer, filename, contentType } =
      await this.tasksService.exportResults(id, format, req.user);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    res.send(buffer);
  }

  @Delete(':id/results')
  clearResults(@Param('id') id: string, @Request() req) {
    return this.tasksService.clearResults(id, req.user);
  }

  @Delete(':id/results/:resultId')
  deleteResult(
    @Param('id') id: string,
    @Param('resultId') resultId: string,
    @Request() req,
  ) {
    return this.tasksService.deleteResult(id, resultId, req.user);
  }
}
