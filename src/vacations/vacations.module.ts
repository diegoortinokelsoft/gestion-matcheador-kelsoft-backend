import { Module } from '@nestjs/common';
import { VacationsController } from './vacations.controller';
import { VacationsService } from './vacations.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [VacationsController],
  providers: [VacationsService],
  exports: [VacationsService],
})
export class VacationsModule {}
