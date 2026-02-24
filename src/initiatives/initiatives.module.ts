import { Module } from '@nestjs/common';
import { InitiativesService } from './initiatives.service';
import { InitiativesController } from './initiatives.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [InitiativesService],
  controllers: [InitiativesController],
  exports: [InitiativesService],
})
export class InitiativesModule {}
