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
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { WorkSessionsService } from './work-sessions.service';

@Controller()
export class WorkSessionsController {
  constructor(private readonly workSessionsService: WorkSessionsService) {}

  @Get('work-sessions/by-user-date')
  getByUserDate(@CurrentUser() actor: AuthUser, @Query() query: CreateSessionDto) {
    return this.workSessionsService.getSessionByUserAndDate(actor, query);
  }

  @Post('work-sessions/ensure')
  ensure(@CurrentUser() actor: AuthUser, @Body() dto: CreateSessionDto) {
    return this.workSessionsService.ensureSession(actor, dto);
  }

  @Patch('work-sessions/:session_id')
  patchSession(
    @CurrentUser() actor: AuthUser,
    @Param('session_id') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.workSessionsService.updateSession(actor, sessionId, dto);
  }

  @Post('work-sessions/:session_id/close')
  closeSession(
    @CurrentUser() actor: AuthUser,
    @Param('session_id') sessionId: string,
  ) {
    return this.workSessionsService.closeSession(actor, sessionId);
  }

  @Post('work-sessions/:session_id/reopen')
  reopenSession(
    @CurrentUser() actor: AuthUser,
    @Param('session_id') sessionId: string,
  ) {
    return this.workSessionsService.reopenSession(actor, sessionId);
  }

  @Get('work-sessions/:session_id/items')
  listItems(
    @CurrentUser() actor: AuthUser,
    @Param('session_id') sessionId: string,
  ) {
    return this.workSessionsService.listItemsBySession(actor, sessionId);
  }

  @Post('work-sessions/:session_id/items')
  createItem(
    @CurrentUser() actor: AuthUser,
    @Param('session_id') sessionId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.workSessionsService.createItem(actor, sessionId, dto);
  }

  @Patch('work-session-items/:item_id')
  patchItem(
    @CurrentUser() actor: AuthUser,
    @Param('item_id') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.workSessionsService.updateItem(actor, itemId, dto);
  }

  @Delete('work-session-items/:item_id')
  deleteItem(
    @CurrentUser() actor: AuthUser,
    @Param('item_id') itemId: string,
  ) {
    return this.workSessionsService.deleteItem(actor, itemId);
  }
}
