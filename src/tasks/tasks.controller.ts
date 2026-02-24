import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { TasksService } from './tasks.service';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TaskCreateDto } from './dto/task-create.dto';
import { BulkTaskCreateDto } from './dto/bulk-task-create.dto';
import { TaskUpdateDto } from './dto/task-update.dto';
import { DeleteTasksDto } from './dto/delete-tasks.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTasksQueryDto) {
    return this.tasksService.listTasks(user, query);
  }

  @Roles('ADMIN', 'LEADER')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: TaskCreateDto) {
    return this.tasksService.createTask(user, dto);
  }

  @Roles('ADMIN', 'LEADER')
  @Post('bulk')
  createBulk(@CurrentUser() user: AuthUser, @Body() dto: BulkTaskCreateDto) {
    return this.tasksService.createTasksBulk(user, dto.data);
  }

  @Roles('ADMIN', 'LEADER')
  @Patch(':taskId')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: TaskUpdateDto,
  ) {
    return this.tasksService.updateTask(user, taskId, dto);
  }

  @Roles('ADMIN', 'LEADER')
  @Delete()
  delete(@CurrentUser() user: AuthUser, @Body() dto: DeleteTasksDto) {
    return this.tasksService.deleteTasks(user, dto.task_ids);
  }
}
