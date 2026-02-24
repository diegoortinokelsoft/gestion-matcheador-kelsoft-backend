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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { InitiativesService } from './initiatives.service';
import { ListInitiativesQueryDto } from './dto/list-initiatives-query.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { ChangeInitiativeStatusDto } from './dto/change-initiative-status.dto';
import { ManageInitiativeMembersDto } from './dto/manage-initiative-members.dto';

@Controller('initiatives')
export class InitiativesController {
  constructor(private readonly initiativesService: InitiativesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListInitiativesQueryDto,
  ) {
    return this.initiativesService.listInitiatives(user, query);
  }

  @Get(':initiativeId')
  getById(
    @CurrentUser() user: AuthUser,
    @Param('initiativeId') initiativeId: string,
  ) {
    return this.initiativesService.getInitiative(user, initiativeId);
  }

  @Roles('ADMIN')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInitiativeDto) {
    return this.initiativesService.createInitiative(user, dto);
  }

  @Roles('ADMIN')
  @Patch(':initiativeId')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('initiativeId') initiativeId: string,
    @Body() dto: UpdateInitiativeDto,
  ) {
    return this.initiativesService.updateInitiative(user, initiativeId, dto);
  }

  @Roles('ADMIN')
  @Post(':initiativeId/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('initiativeId') initiativeId: string,
    @Body() dto: ChangeInitiativeStatusDto,
  ) {
    return this.initiativesService.changeStatus(user, initiativeId, dto.status);
  }

  @Post(':initiativeId/members')
  assignMembers(
    @CurrentUser() user: AuthUser,
    @Param('initiativeId') initiativeId: string,
    @Body() dto: ManageInitiativeMembersDto,
  ) {
    return this.initiativesService.assignMembers(user, initiativeId, dto.user_ids);
  }

  @Delete(':initiativeId/members')
  removeMembers(
    @CurrentUser() user: AuthUser,
    @Param('initiativeId') initiativeId: string,
    @Body() dto: ManageInitiativeMembersDto,
  ) {
    return this.initiativesService.removeMembers(user, initiativeId, dto.user_ids);
  }
}
