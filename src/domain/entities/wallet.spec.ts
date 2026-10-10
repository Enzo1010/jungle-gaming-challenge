import { describe, it, expect } from 'vitest';
import { Wallet } from './wallet.js';
import { WalletLedgerEntry, LedgerDirection } from './wallet-ledger-entry.js';
import { Money } from '../value-objects/money.js';
import {
  CurrencyMismatchError,
  InsufficientFundsError,
  InvalidLedgerMathError,
} from '../errors/domain.error.js';

describe('Wallet and WalletLedgerEntry', () => {
  const currency = 'BRL';

  describe('WalletLedgerEntry', () => {
    it('creates a debit entry successfully when math is correct', () => {
      const balanceBefore = Money.from({ amount: '100.00', currency });
      const money = Money.from({ amount: '25.00', currency });
      const balanceAfter = Money.from({ amount: '75.00', currency });

      const entry = WalletLedgerEntry.create({
        id: 'entry-1',
        walletId: 'wallet-1',
        transactionId: 'tx-1',
        direction: LedgerDirection.Debit,
        money,
        balanceBefore,
        balanceAfter,
        createdAt: new Date(),
      });

      expect(entry.isBalanced()).toBe(true);
      expect(entry.balanceAfter.equals(balanceAfter)).toBe(true);
    });

    it('creates a credit entry successfully when math is correct', () => {
      const balanceBefore = Money.from({ amount: '100.00', currency });
      const money = Money.from({ amount: '25.00', currency });
      const balanceAfter = Money.from({ amount: '125.00', currency });

      const entry = WalletLedgerEntry.create({
        id: 'entry-2',
        walletId: 'wallet-1',
        transactionId: 'tx-2',
        direction: LedgerDirection.Credit,
        money,
        balanceBefore,
        balanceAfter,
        createdAt: new Date(),
      });

      expect(entry.isBalanced()).toBe(true);
      expect(entry.balanceAfter.equals(balanceAfter)).toBe(true);
    });

    it('throws InvalidLedgerMathError on debit if math is wrong', () => {
      const balanceBefore = Money.from({ amount: '100.00', currency });
      const money = Money.from({ amount: '25.00', currency });
      const balanceAfter = Money.from({ amount: '50.00', currency }); // Wrong math

      expect(() => {
        WalletLedgerEntry.create({
          id: 'entry-3',
          walletId: 'wallet-1',
          transactionId: 'tx-3',
          direction: LedgerDirection.Debit,
          money,
          balanceBefore,
          balanceAfter,
          createdAt: new Date(),
        });
      }).toThrow(InvalidLedgerMathError);
    });

    it('throws InvalidLedgerMathError on credit if math is wrong', () => {
      const balanceBefore = Money.from({ amount: '100.00', currency });
      const money = Money.from({ amount: '25.00', currency });
      const balanceAfter = Money.from({ amount: '100.00', currency }); // Wrong math

      expect(() => {
        WalletLedgerEntry.create({
          id: 'entry-4',
          walletId: 'wallet-1',
          transactionId: 'tx-4',
          direction: LedgerDirection.Credit,
          money,
          balanceBefore,
          balanceAfter,
          createdAt: new Date(),
        });
      }).toThrow(InvalidLedgerMathError);
    });
  });

  describe('Wallet', () => {
    it('opens a new wallet with version 1', () => {
      const initialBalance = Money.from({ amount: '100.00', currency });
      const wallet = Wallet.open({ id: 'w-1', playerId: 'p-1', initialBalance });

      expect(wallet.id).toBe('w-1');
      expect(wallet.playerId).toBe('p-1');
      expect(wallet.balance.equals(initialBalance)).toBe(true);
      expect(wallet.version).toBe(1);
      expect(wallet.currency).toBe(currency);
    });

    it('successfully debits money, returns ledger entry and updates balance', () => {
      const wallet = Wallet.open({
        id: 'w-1',
        playerId: 'p-1',
        initialBalance: Money.from({ amount: '100.00', currency }),
      });
      const initialUpdatedAt = wallet.updatedAt;

      const moneyToDebit = Money.from({ amount: '25.00', currency });
      const ledgerEntry = wallet.debit(moneyToDebit, 'tx-1');

      expect(wallet.balance.toJSON()).toEqual({ amount: '75.00', currency });
      expect(wallet.version).toBe(1);
      expect(wallet.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());

      expect(ledgerEntry.direction).toBe(LedgerDirection.Debit);
      expect(ledgerEntry.money.equals(moneyToDebit)).toBe(true);
      expect(ledgerEntry.balanceAfter.equals(wallet.balance)).toBe(true);
      expect(ledgerEntry.transactionId).toBe('tx-1');
      expect(ledgerEntry.walletId).toBe('w-1');
    });

    it('successfully credits money, returns ledger entry and updates balance', () => {
      const wallet = Wallet.open({
        id: 'w-2',
        playerId: 'p-2',
        initialBalance: Money.from({ amount: '100.00', currency }),
      });

      const moneyToCredit = Money.from({ amount: '50.00', currency });
      const ledgerEntry = wallet.credit(moneyToCredit, 'tx-2');

      expect(wallet.balance.toJSON()).toEqual({ amount: '150.00', currency });
      expect(wallet.version).toBe(1);

      expect(ledgerEntry.direction).toBe(LedgerDirection.Credit);
      expect(ledgerEntry.money.equals(moneyToCredit)).toBe(true);
      expect(ledgerEntry.balanceAfter.equals(wallet.balance)).toBe(true);
    });

    it('throws InsufficientFundsError when debit exceeds balance', () => {
      const wallet = Wallet.open({
        id: 'w-3',
        playerId: 'p-3',
        initialBalance: Money.from({ amount: '50.00', currency }),
      });

      const moneyToDebit = Money.from({ amount: '75.00', currency });
      expect(() => wallet.debit(moneyToDebit, 'tx-3')).toThrow(InsufficientFundsError);

      // Asserts state hasn't changed
      expect(wallet.version).toBe(1);
      expect(wallet.balance.toJSON()).toEqual({ amount: '50.00', currency });
    });

    it('throws CurrencyMismatchError on debit or credit with wrong currency', () => {
      const wallet = Wallet.open({
        id: 'w-4',
        playerId: 'p-4',
        initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
      });

      const moneyUSD = Money.from({ amount: '10.00', currency: 'USD' });

      expect(() => wallet.debit(moneyUSD, 'tx-4')).toThrow(CurrencyMismatchError);
      expect(() => wallet.credit(moneyUSD, 'tx-5')).toThrow(CurrencyMismatchError);
    });
  });
});
