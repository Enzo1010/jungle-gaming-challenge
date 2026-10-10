import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DomainExceptionFilter } from './filters/domain-exception.filter.js';
import { WageringController } from './controllers/wagering.controller.js';
import { WalletsController } from './controllers/wallets.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { DomainModule } from '../../domain.module.js';

@Module({
  imports: [DomainModule],
  controllers: [WageringController, WalletsController, HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
  ],
})
export class HttpModule {}
