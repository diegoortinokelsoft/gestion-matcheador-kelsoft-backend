import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { WorkSessionsService } from './work-sessions.service';
import { UpsertSessionItemDto } from './dto/upsert-session-item.dto';
import { PatchSessionItemDto } from './dto/patch-session-item.dto';
import { ListWorkSessionsQueryDto } from './dto/list-work-sessions-query.dto';

@Controller('work_sessions')
export class WorkSessionsController {
  constructor(private readonly workSessionsService: WorkSessionsService) {}

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
