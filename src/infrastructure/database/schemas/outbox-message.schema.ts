import { EntitySchema } from '@mikro-orm/core';
import { OutboxMessage } from '../../../domain/entities/outbox-message.js';

export const OutboxMessageSchema = new EntitySchema<any>({
  class: OutboxMessage as any,
  tableName: 'outbox_messages',
  properties: {
    id: { type: 'uuid', primary: true },
    aggregateId: { type: 'string' },
    eventType: { type: 'string' },
    payload: { type: 'json' },
    occurredAt: { type: 'Date' },
    _attempts: { type: 'number', name: 'attempts' },
    _nextAttemptAt: { type: 'Date', nullable: true, name: 'next_attempt_at', index: true },
    _publishedAt: { type: 'Date', nullable: true, name: 'published_at', index: true },
  },
});
