import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { HttpModule } from './infrastructure/http/http.module.js';
import { MessagingModule } from './infrastructure/messaging/messaging.module.js';
import { DomainModule } from './domain.module.js';
import config from './mikro-orm.config.js';
import * as crypto from 'node:crypto';

@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    ScheduleModule.forRoot(),
    PrometheusModule.register(),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) => req.headers['x-correlation-id'] || req.headers['idempotency-key'] || crypto.randomUUID(),
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      },
    }),
    DomainModule,
    HttpModule,
    MessagingModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
