import { Module } from '@nestjs/common';
import { SqsService } from './sqs.service.js';
import { OutboxPublisherWorker } from './outbox-publisher.worker.js';
import { SqsConsumerWorker } from './sqs-consumer.worker.js';
import { PendingReferenceWorker } from './pending-reference.worker.js';
import { DomainModule } from '../../domain.module.js';

@Module({
  imports: [DomainModule],
  providers: [
    SqsService,
    OutboxPublisherWorker,
    SqsConsumerWorker,
    PendingReferenceWorker,
  ],
})
export class MessagingModule {}
