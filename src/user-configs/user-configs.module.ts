import { Module } from '@nestjs/common';
import { UserConfigsService } from './user-configs.service';

@Module({
  providers: [UserConfigsService],
  exports: [UserConfigsService],
})
export class UserConfigsModule {}
