import { describe, it, expect } from 'vitest';
import { OutboxMessage } from './outbox-message.js';
import { IntegrationEvent, IntegrationEventProps } from './integration-event.js';

interface TestEventData {
  foo: string;
}

class TestIntegrationEvent extends IntegrationEvent<TestEventData> {
  readonly eventType = 'TestIntegrationEvent';
  readonly version = 1;

  constructor(props: IntegrationEventProps<TestEventData>) {
    super(props);
  }
}

describe('OutboxMessage', () => {
  it('enqueues an integration event', () => {
    const occurredAt = new Date();
    const event = new TestIntegrationEvent({
      eventId: 'evt-1',
      aggregateId: 'agg-1',
      correlationId: 'corr-1',
      occurredAt,
      data: { foo: 'bar' },
    });

    const msg = OutboxMessage.enqueue(event);

    expect(msg.id).toBeDefined();
    expect(msg.aggregateId).toBe('agg-1');
    expect(msg.eventType).toBe('TestIntegrationEvent');
    expect(msg.occurredAt).toBe(occurredAt);
    expect(msg.attempts).toBe(0);
    expect(msg.isPending()).toBe(true);
    expect(msg.nextAttemptAt).toBeUndefined();
    expect(msg.payload).toEqual({
      eventId: 'evt-1',
      eventType: 'TestIntegrationEvent',
      aggregateId: 'agg-1',
      correlationId: 'corr-1',
      causationId: undefined,
      occurredAt: occurredAt.toISOString(),
      version: 1,
      data: { foo: 'bar' },
    });
  });

  it('evaluates isDue correctly', () => {
    const event = new TestIntegrationEvent({
      eventId: 'evt-1',
      aggregateId: 'agg-1',
      correlationId: 'corr-1',
      occurredAt: new Date(),
      data: { foo: 'bar' },
    });
    const msg = OutboxMessage.enqueue(event);

    const now = new Date();
    // initially no nextAttemptAt, so it is due
    expect(msg.isDue(now)).toBe(true);

    // mark as published, no longer pending nor due
    msg.markPublished(now);
    expect(msg.isPending()).toBe(false);
    expect(msg.isDue(now)).toBe(false);
  });

  it('schedules retry with exponential backoff', () => {
    const event = new TestIntegrationEvent({
      eventId: 'evt-1',
      aggregateId: 'agg-1',
      correlationId: 'corr-1',
      occurredAt: new Date(),
      data: { foo: 'bar' },
    });
    const msg = OutboxMessage.enqueue(event);
    
    const now = new Date('2026-01-01T12:00:00Z');
    
    // First retry
    msg.scheduleRetry(now);
    expect(msg.attempts).toBe(1);
    // (2 ^ 1) * 1000 = 2000ms
    expect(msg.nextAttemptAt?.getTime()).toBe(now.getTime() + 2000);
    
    // Not due yet, just after scheduling
    expect(msg.isDue(now)).toBe(false);
    // Due exactly at the next attempt time
    expect(msg.isDue(new Date(now.getTime() + 2000))).toBe(true);

    // Second retry
    const later = new Date('2026-01-01T12:00:05Z');
    msg.scheduleRetry(later);
    expect(msg.attempts).toBe(2);
    // (2 ^ 2) * 1000 = 4000ms
    expect(msg.nextAttemptAt?.getTime()).toBe(later.getTime() + 4000);
  });

  it('rehydrates an outbox message correctly', () => {
    const occurredAt = new Date();
    const nextAttemptAt = new Date();
    const msg = OutboxMessage.rehydrate({
      id: 'msg-id',
      aggregateId: 'agg-1',
      eventType: 'TestEvent',
      payload: { foo: 'bar' },
      occurredAt,
      attempts: 3,
      nextAttemptAt,
    });

    expect(msg.id).toBe('msg-id');
    expect(msg.aggregateId).toBe('agg-1');
    expect(msg.attempts).toBe(3);
    expect(msg.nextAttemptAt).toBe(nextAttemptAt);
    expect(msg.publishedAt).toBeUndefined();
    expect(msg.isPending()).toBe(true);
  });
});
