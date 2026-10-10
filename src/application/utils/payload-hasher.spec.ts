import { describe, it, expect } from 'vitest';
import { PayloadHasher } from './payload-hasher.js';
import { Money } from '../../domain/value-objects/money.js';

describe('PayloadHasher (Hotfix V1.0.1)', () => {
  const baseDto = {
    providerId: 'prov-1',
    externalTransactionId: 'ext-1',
    playerId: 'p-1',
    walletId: 'w-1',
    roundId: 'r-1',
    gameId: 'g-1',
    kind: 'BET',
    money: Money.from({ amount: '10.00', currency: 'BRL' }),
  };

  it('preserves key order invariance (canonical JSON)', () => {
    const hash1 = PayloadHasher.generate({ a: 1, b: 2, ...baseDto });
    const hash2 = PayloadHasher.generate({ b: 2, a: 1, ...baseDto });
    expect(hash1).toBe(hash2);
  });

  it('differentiates null vs undefined / omitted field', () => {
    const hashWithNull = PayloadHasher.generate({
      ...baseDto,
      referenceExternalTransactionId: null,
    });
    const hashOmitted = PayloadHasher.generate({
      ...baseDto,
    });
    expect(hashWithNull).not.toBe(hashOmitted);
  });

  it('differentiates empty array [] vs omitted field', () => {
    const hashWithArray = PayloadHasher.generate({
      ...baseDto,
      tags: [],
    });
    const hashWithoutArray = PayloadHasher.generate({
      ...baseDto,
    });
    expect(hashWithArray).not.toBe(hashWithoutArray);
  });

  it('detects surprise extra fields', () => {
    const normalHash = PayloadHasher.generate(baseDto);
    const tamperedHash = PayloadHasher.generate({
      ...baseDto,
      bonusCode: 'HACKED',
    });
    expect(normalHash).not.toBe(tamperedHash);
  });

  it('strips transport metadata (idempotencyKey, inbox) from hash calculation', () => {
    const hashWithoutTransport = PayloadHasher.generate(baseDto);
    const hashWithTransport = PayloadHasher.generate({
      ...baseDto,
      idempotencyKey: 'idem-xyz',
      inbox: { messageId: 'm1', consumerName: 'c1' },
    });
    expect(hashWithTransport).toBe(hashWithoutTransport);
  });
});
