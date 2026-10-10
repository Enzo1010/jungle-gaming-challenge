import { EntitySchema } from '@mikro-orm/core';
import { WalletLedgerEntry, LedgerDirection } from '../../../domain/entities/wallet-ledger-entry.js';
import { Money } from '../../../domain/value-objects/money.js';

export const WalletLedgerEntrySchema = new EntitySchema<any>({
  class: WalletLedgerEntry as any,
  tableName: 'wallet_ledger_entries',
  properties: {
    id: { type: 'uuid', primary: true },
    walletId: { type: 'string' },
    transactionId: { type: 'string' },
    direction: { enum: true, items: () => LedgerDirection },
    money: { kind: 'embedded', entity: () => Money, prefix: 'money_' },
    balanceBefore: { kind: 'embedded', entity: () => Money, prefix: 'balance_before_' },
    balanceAfter: { kind: 'embedded', entity: () => Money, prefix: 'balance_after_' },
    createdAt: { type: 'Date' },
  },
});
