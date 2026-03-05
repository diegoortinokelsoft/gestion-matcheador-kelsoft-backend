import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { WorkSessionsService } from './work-sessions.service';
import { CreateWorkSessionDto } from './dto/create-work-session.dto';
import { GenerateDailyWorkSessionsDto } from './dto/generate-daily-work-sessions.dto';
import { ListWorkSessionsQueryDto } from './dto/list-work-sessions-query.dto';
import { PatchSessionItemDto } from './dto/patch-session-item.dto';
import { UpsertSessionItemDto } from './dto/upsert-session-item.dto';

@Controller('work_sessions')
export class WorkSessionsController {
  constructor(private readonly workSessionsService: WorkSessionsService) {}

  @Roles('ADMIN', 'LEADER')
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWorkSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.workSessionsService.createSession(user, dto);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.session;
  }

  @Roles('ADMIN', 'LEADER')
  @HttpCode(HttpStatus.OK)
  @Post('generate_daily')
  generateDaily(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateDailyWorkSessionsDto,
  ) {
    return this.workSessionsService.generateDaily(user, dto);
  }

  @Post(':sessionId/items')
  upsertItem(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpsertSessionItemDto,
  ) {
    return this.workSessionsService.upsertItem(user, sessionId, dto);
  }

  @Roles('ADMIN')
  @Patch(':sessionId/items/:itemId')
  patchItem(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('itemId') itemId: string,
    @Body() dto: PatchSessionItemDto,
  ) {
    return this.workSessionsService.patchItem(user, sessionId, itemId, dto);
  }

  @Post(':sessionId/close')
  closeSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.workSessionsService.closeSession(user, sessionId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListWorkSessionsQueryDto,
  ) {
    return this.workSessionsService.listSessions(user, query);
  }
}
