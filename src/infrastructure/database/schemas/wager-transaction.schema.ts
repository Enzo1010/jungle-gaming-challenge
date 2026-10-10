import { EntitySchema } from '@mikro-orm/core';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '../../../domain/entities/wager-transaction.js';
import { Money } from '../../../domain/value-objects/money.js';

export const WagerTransactionSchema = new EntitySchema<any>({
  class: WagerTransaction as any,
  tableName: 'wager_transactions',
  properties: {
    id: { type: 'uuid', primary: true },
    providerId: { type: 'string' },
    externalTransactionId: { type: 'string' },
    idempotencyKey: { type: 'string' },
    payloadHash: { type: 'string' },
    walletId: { type: 'string' },
    playerId: { type: 'string' },
    roundId: { type: 'string' },
    gameId: { type: 'string' },
    kind: { enum: true, items: () => WagerTransactionKind },
    money: { kind: 'embedded', entity: () => Money, prefix: false },
    referenceExternalTransactionId: { type: 'string', nullable: true },
    createdAt: { type: 'Date' },
    _status: { enum: true, items: () => WagerTransactionStatus, name: 'status' },
    _referenceTransactionId: { type: 'string', nullable: true, name: 'reference_transaction_id' },
    _failureCode: { type: 'string', nullable: true, name: 'failure_code' },
    _processedAt: { type: 'Date', nullable: true, name: 'processed_at' },
  },
  uniques: [
    { properties: ['idempotencyKey'] },
    { properties: ['providerId', 'externalTransactionId'] },
  ],
});
