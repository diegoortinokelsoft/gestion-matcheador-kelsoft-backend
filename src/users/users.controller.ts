import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UsersService } from './users.service';
import { GetUserConfigsQueryDto } from './dto/get-user-configs-query.dto';
import { UpdateUserConfigDto } from './dto/update-user-config.dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user);
  }

  @Get('users/:userId/configs')
  getConfigs(
    @CurrentUser() actor: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: GetUserConfigsQueryDto,
  ) {
    return this.usersService.getUserConfigs(actor, userId, query.namespace);
  }

  @Put('users/:userId/configs')
  putConfig(
    @CurrentUser() actor: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserConfigDto,
  ) {
    return this.usersService.updateUserConfig(
      actor,
      userId,
      dto.namespace,
      dto.key,
      dto.value,
      dto.scope,
    );
  }
}
