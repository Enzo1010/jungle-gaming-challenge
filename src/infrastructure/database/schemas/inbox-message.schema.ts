import { EntitySchema } from '@mikro-orm/core';
import { InboxMessage } from '../../../domain/entities/inbox-message.js';

export const InboxMessageSchema = new EntitySchema<any>({
  class: InboxMessage as any,
  tableName: 'inbox_messages',
  properties: {
    messageId: { type: 'string', primary: true }, // Using messageId as PK along with consumerName
    consumerName: { type: 'string', primary: true },
    payloadHash: { type: 'string' },
    receivedAt: { type: 'Date' },
    _processedAt: { type: 'Date', nullable: true, name: 'processed_at' },
  },
  uniques: [
    { properties: ['consumerName', 'messageId'] },
  ],
});
