import { Controller, Get } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

@Controller('health')
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  @Get('live')
  getLive() {
    return { status: 'UP' };
  }

  @Get('ready')
  async getReady() {
    let dbStatus = 'DOWN';
    try {
      const isConnected = await this.em.getConnection().isConnected();
      if (isConnected) dbStatus = 'UP';
    } catch (e) {
      dbStatus = 'DOWN';
    }

    return {
      status: dbStatus === 'UP' ? 'UP' : 'DOWN',
      database: dbStatus,
      sqs: 'UP' // Placeholder until SQS is fully wired
    };
  }
}
