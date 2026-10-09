import { describe, it, expect } from 'vitest';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.js';
import { Money } from '../value-objects/money.js';
import { LedgerDirection } from './wallet-ledger-entry.js';
import {
  InvalidTransactionStateError,
  MissingReferenceError,
} from '../errors/domain.error.js';

describe('WagerTransaction', () => {
  const defaultProps = {
    id: 'tx-1',
    providerId: 'provider-1',
    externalTransactionId: 'ext-tx-1',
    idempotencyKey: 'idemp-1',
    payloadHash: 'hash-1',
    walletId: 'w-1',
    playerId: 'p-1',
    roundId: 'r-1',
    gameId: 'g-1',
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: '10.00', currency: 'BRL' }),
  };

  describe('creation', () => {
    it('creates a PENDING transaction', () => {
      const tx = WagerTransaction.create(defaultProps);
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.isTerminal()).toBe(false);
      expect(tx.affectsBalance()).toBe(true);
      expect(tx.requiresReference()).toBe(false);
    });

    it('throws MissingReferenceError when creating REFUND without reference', () => {
      expect(() =>
        WagerTransaction.create({
          ...defaultProps,
          kind: WagerTransactionKind.Refund,
        }),
      ).toThrow(MissingReferenceError);
    });

    it('throws MissingReferenceError when creating ROLLBACK without reference', () => {
      expect(() =>
        WagerTransaction.create({
          ...defaultProps,
          kind: WagerTransactionKind.Rollback,
        }),
      ).toThrow(MissingReferenceError);
    });

    it('creates a REFUND successfully when reference is provided', () => {
      const tx = WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'ext-tx-0',
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBe(true);
    });
  });

  describe('state transitions', () => {
    it('transitions to PROCESSED', () => {
      const tx = WagerTransaction.create(defaultProps);
      const now = new Date();
      tx.markProcessed(undefined, now);
      
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.processedAt).toBe(now);
      expect(tx.isTerminal()).toBe(true);
    });

    it('transitions to PENDING_REFERENCE', () => {
      const tx = WagerTransaction.create(defaultProps);
      tx.markPendingReference();
      
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
      expect(tx.isTerminal()).toBe(false);
    });

    it('transitions to REJECTED', () => {
      const tx = WagerTransaction.create(defaultProps);
      tx.reject('INSUFFICIENT_FUNDS');
      
      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe('INSUFFICIENT_FUNDS');
      expect(tx.isTerminal()).toBe(true);
      expect(tx.affectsBalance()).toBe(false); // Rejected tx doesn't affect balance
    });

    it('transitions to FAILED', () => {
      const tx = WagerTransaction.create(defaultProps);
      tx.fail('DB_TIMEOUT');
      
      expect(tx.status).toBe(WagerTransactionStatus.Failed);
      expect(tx.failureCode).toBe('DB_TIMEOUT');
      expect(tx.isTerminal()).toBe(true);
    });

    it('throws InvalidTransactionStateError when transitioning from PROCESSED', () => {
      const tx = WagerTransaction.create(defaultProps);
      tx.markProcessed(undefined, new Date());
      
      expect(() => tx.markProcessed(undefined, new Date())).toThrow(InvalidTransactionStateError);
      expect(() => tx.markPendingReference()).toThrow(InvalidTransactionStateError);
      expect(() => tx.reject('CODE')).toThrow(InvalidTransactionStateError);
      expect(() => tx.fail('CODE')).toThrow(InvalidTransactionStateError);
    });

    it('throws InvalidTransactionStateError when transitioning from REJECTED', () => {
      const tx = WagerTransaction.create(defaultProps);
      tx.reject('CODE');
      
      expect(() => tx.markProcessed(undefined, new Date())).toThrow(InvalidTransactionStateError);
    });
  });

  describe('domain queries', () => {
    it('affectsBalance returns correctly', () => {
      const bet = WagerTransaction.create(defaultProps);
      expect(bet.affectsBalance()).toBe(true);

      const loss = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Loss });
      expect(loss.affectsBalance()).toBe(false);

      const rejectedBet = WagerTransaction.create(defaultProps);
      rejectedBet.reject('ERR');
      expect(rejectedBet.affectsBalance()).toBe(false);
    });

    it('matchesPayload compares payload hashes', () => {
      const tx = WagerTransaction.create(defaultProps);
      expect(tx.matchesPayload('hash-1')).toBe(true);
      expect(tx.matchesPayload('hash-2')).toBe(false);
    });

    it('ledgerDirectionFor works correctly', () => {
      const bet = WagerTransaction.create(defaultProps);
      expect(bet.ledgerDirectionFor()).toBe(LedgerDirection.Debit);

      const win = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Win });
      expect(win.ledgerDirectionFor()).toBe(LedgerDirection.Credit);

      const refund = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Refund, referenceExternalTransactionId: 'ref' });
      expect(refund.ledgerDirectionFor()).toBe(LedgerDirection.Credit);

      const rollback = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Rollback, referenceExternalTransactionId: 'ref' });
      
      // Rollback of BET (debit) -> CREDIT
      expect(rollback.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
      
      // Rollback of WIN (credit) -> DEBIT
      expect(rollback.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
      
      // Rollback without reference throws
      expect(() => rollback.ledgerDirectionFor()).toThrow('ROLLBACK requires a reference');

      const loss = WagerTransaction.create({ ...defaultProps, kind: WagerTransactionKind.Loss });
      expect(() => loss.ledgerDirectionFor()).toThrow('LOSS transactions do not have a ledger direction');
    });
  });
});
