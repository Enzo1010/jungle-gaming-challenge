import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { AppModule } from '../app.module.js';
import { Wallet } from '../domain/entities/wallet.js';
import { WalletLedgerEntry, LedgerDirection } from '../domain/entities/wallet-ledger-entry.js';
import { Money } from '../domain/value-objects/money.js';
import { expect } from 'vitest';

export async function getTestApp(): Promise<TestingModule> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  return moduleFixture;
}

export async function clearDatabase(em: EntityManager): Promise<void> {
  await em.getConnection().execute(
    'TRUNCATE TABLE outbox_messages, inbox_messages, wager_transactions, wallet_ledger_entries, wallets CASCADE;'
  );
}

export async function verifyLedgerConsistency(walletId: string, em: EntityManager): Promise<void> {
  const wallet = await em.findOneOrFail(Wallet, { id: walletId });
  const entries = await em.find(WalletLedgerEntry, { walletId });
  
  let sum = Money.from({ amount: '0.00', currency: wallet.currency });
  
  for (const entry of entries) {
    if (entry.direction === LedgerDirection.Credit) {
      sum = sum.add(entry.money);
    } else {
      sum = sum.subtract(entry.money);
    }
  }

  expect(sum.equals(wallet.balance)).toBe(true);
}
