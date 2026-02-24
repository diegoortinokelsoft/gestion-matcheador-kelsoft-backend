import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppsScriptClientService } from './apps-script-client.service';

@Global()
@Module({
  imports: [HttpModule],
  providers: [AppsScriptClientService],
  exports: [AppsScriptClientService],
})
export class AppsScriptClientModule {}
