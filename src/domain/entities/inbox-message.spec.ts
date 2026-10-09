import { describe, it, expect } from 'vitest';
import { InboxMessage } from './inbox-message.js';

describe('InboxMessage', () => {
  it('creates an inbox message via receive', () => {
    const receivedAt = new Date();
    const msg = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'my-consumer',
      payloadHash: 'hash',
      receivedAt,
    });

    expect(msg.messageId).toBe('msg-1');
    expect(msg.consumerName).toBe('my-consumer');
    expect(msg.payloadHash).toBe('hash');
    expect(msg.receivedAt).toBe(receivedAt);
    expect(msg.isProcessed()).toBe(false);
    expect(msg.processedAt).toBeUndefined();
  });

  it('marks message as processed', () => {
    const msg = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'c1',
      payloadHash: 'h1',
      receivedAt: new Date(),
    });

    const processedAt = new Date();
    msg.markProcessed(processedAt);

    expect(msg.isProcessed()).toBe(true);
    expect(msg.processedAt).toBe(processedAt);
  });

  it('rehydrates an inbox message correctly', () => {
    const receivedAt = new Date();
    const processedAt = new Date();
    
    const msg = InboxMessage.rehydrate({
      messageId: 'msg-1',
      consumerName: 'c1',
      payloadHash: 'h1',
      receivedAt,
      processedAt,
    });

    expect(msg.messageId).toBe('msg-1');
    expect(msg.isProcessed()).toBe(true);
    expect(msg.processedAt).toBe(processedAt);
  });
});
