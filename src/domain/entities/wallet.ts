import { Money } from '../value-objects/money.js';
import { WalletLedgerEntry, LedgerDirection } from './wallet-ledger-entry.js';
import { InsufficientFundsError, CurrencyMismatchError } from '../errors/domain.error.js';
import * as crypto from 'node:crypto';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
     
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: { id: string; playerId: string; initialBalance: Money }): Wallet {
    const now = new Date();
    // "_version inicia em 1 e só incrementa quando o saldo efetivamente muda"
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get currency(): string {
    return this._balance.currency;
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(money: Money, transactionId: string, ledgerEntryId?: string): WalletLedgerEntry {
    this.assertSameCurrency(money);

    if (this._balance.isLessThan(money)) {
      throw new InsufficientFundsError(this.id, this._balance.toString(), money.toString());
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(money);

    this._balance = balanceAfter;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      id: ledgerEntryId ?? crypto.randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Debit,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: this._updatedAt,
    });
  }

  credit(money: Money, transactionId: string, ledgerEntryId?: string): WalletLedgerEntry {
    this.assertSameCurrency(money);

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(money);

    this._balance = balanceAfter;
    this._updatedAt = new Date();

    return WalletLedgerEntry.create({
      id: ledgerEntryId ?? crypto.randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Credit,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: this._updatedAt,
    });
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new CurrencyMismatchError(this.currency, money.currency);
    }
  }
}
