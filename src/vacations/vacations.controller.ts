import { Controller, Get, Param, Post, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { VacationsService } from './vacations.service';
import { ListVacationsQueryDto } from './dto/list-vacations-query.dto';
import { CreateVacationDto } from './dto/create-vacation.dto';

@Controller('vacations')
export class VacationsController {
  constructor(private readonly vacationsService: VacationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListVacationsQueryDto) {
    return this.vacationsService.listVacations(user, query);
  }

  @Get(':vacationId')
  getById(
    @CurrentUser() user: AuthUser,
    @Param('vacationId') vacationId: string,
  ) {
    return this.vacationsService.getVacationById(user, vacationId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVacationDto) {
    return this.vacationsService.createVacation(user, dto);
  }

  @Roles('ADMIN', 'LEADER')
  @Post(':vacationId/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('vacationId') vacationId: string,
  ) {
    return this.vacationsService.approveVacation(user, vacationId);
  }

  @Roles('ADMIN', 'LEADER')
  @Post(':vacationId/deny')
  deny(
    @CurrentUser() user: AuthUser,
    @Param('vacationId') vacationId: string,
  ) {
    return this.vacationsService.denyVacation(user, vacationId);
  }
}
