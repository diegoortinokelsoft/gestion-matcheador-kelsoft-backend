import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { InitiativesModule } from './initiatives/initiatives.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { VacationsModule } from './vacations/vacations.module';
import { WorkSessionsModule } from './work-sessions/work-sessions.module';
import { AppsScriptClientModule } from './upstream/apps-script-client.module';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { AuditModule } from './audit/audit.module';
import { UserConfigsModule } from './user-configs/user-configs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ttl: Number(configService.get('CACHE_TTL_LISTS_SEC') ?? 60) * 1000,
        max: 500,
      }),
    }),
    AppsScriptClientModule,
    AuthModule,
    AuditModule,
    UserConfigsModule,
    UsersModule,
    InitiativesModule,
    WorkSessionsModule,
    VacationsModule,
    TasksModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
