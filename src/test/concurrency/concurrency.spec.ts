import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { getTestApp, clearDatabase, verifyLedgerConsistency } from '../setup.js';
import { EntityManager } from '@mikro-orm/core';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case.js';
import { Wallet } from '../../domain/entities/wallet.js';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '../../domain/entities/wager-transaction.js';
import { Money } from '../../domain/value-objects/money.js';
import { WalletLedgerEntry } from '../../domain/entities/wallet-ledger-entry.js';
import * as crypto from 'node:crypto';

describe('Concurrency Tests', () => {
  let app: TestingModule;
  let em: EntityManager;
  let useCase: ProcessWagerTransactionUseCase;
  
  beforeAll(async () => {
    app = await getTestApp();
    em = app.get(EntityManager).fork();
    useCase = app.get(ProcessWagerTransactionUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(em);
    em.clear();
  });

  it('Scenario A: Same bet 50 times (Idempotency race)', async () => {
    const walletId = crypto.randomUUID();
    const money = Money.from({ amount: '100.00', currency: 'BRL' });
    const wallet = Wallet.open({ id: walletId, playerId: 'player-a', initialBalance: Money.from({ amount: "0.00", currency: "BRL" }) });
    const entry = wallet.credit(money, crypto.randomUUID());
    em.persist([wallet, entry]);
    await em.flush();

    const idempotencyKey = 'idemp-race-50';
    const dto = {
      providerId: 'prov-a',
      externalTransactionId: 'ext-a',
      idempotencyKey,
      payloadHash: 'hash-a',
      walletId,
      playerId: 'player-a',
      roundId: 'r-a',
      gameId: 'g-a',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '80.00', currency: 'BRL' }),
    };

    const promises = Array.from({ length: 50 }).map(() => useCase.execute(dto).catch(e => e));
    await Promise.all(promises);

    em.clear();
    const finalWallet = await em.findOneOrFail(Wallet, { id: walletId });
    expect(finalWallet.balance.toJSON().amount).toBe('20.00');

    const wagers = await em.find(WagerTransaction, { idempotencyKey });
    expect(wagers.length).toBe(1);
    expect(wagers[0].status).toBe(WagerTransactionStatus.Processed);

    const entries = await em.find(WalletLedgerEntry, { walletId });
    expect(entries.length).toBe(2);

    await verifyLedgerConsistency(walletId, em);
  });

  it('Scenario B: Balance Dispute - Hot Wallet', async () => {
    const walletId = crypto.randomUUID();
    const money = Money.from({ amount: '100.00', currency: 'BRL' });
    const wallet = Wallet.open({ id: walletId, playerId: 'player-b', initialBalance: Money.from({ amount: "0.00", currency: "BRL" }) });
    const entry = wallet.credit(money, crypto.randomUUID());
    em.persist([wallet, entry]);
    await em.flush();

    const makeDto = (idx: number) => ({
      providerId: 'prov-b',
      externalTransactionId: `ext-b-${idx}`,
      idempotencyKey: `idemp-hot-${idx}`,
      payloadHash: `hash-b-${idx}`,
      walletId,
      playerId: 'player-b',
      roundId: 'r-b',
      gameId: 'g-b',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '50.00', currency: 'BRL' }),
    });

    const dtos = [makeDto(1), makeDto(2), makeDto(3)];
    const promises = dtos.map(dto => useCase.execute(dto).catch(e => e));
    await Promise.all(promises);

    em.clear();
    const finalWallet = await em.findOneOrFail(Wallet, { id: walletId });
    expect(finalWallet.balance.toJSON().amount).toBe('0.00');

    const wagers = await em.find(WagerTransaction, { walletId }, { orderBy: { createdAt: 'asc' } });
    const processed = wagers.filter(w => w.status === WagerTransactionStatus.Processed);
    const rejected = wagers.filter(w => w.status === WagerTransactionStatus.Rejected);
    
    expect(processed.length).toBe(2);
    expect(rejected.length).toBe(1);

    const entries = await em.find(WalletLedgerEntry, { walletId });
    expect(entries.length).toBe(3);

    await verifyLedgerConsistency(walletId, em);
  });

  it('Scenario C: Inverse order - ROLLBACK before BET', async () => {
    const walletId = crypto.randomUUID();
    const money = Money.from({ amount: '100.00', currency: 'BRL' });
    const wallet = Wallet.open({ id: walletId, playerId: 'player-c', initialBalance: Money.from({ amount: "0.00", currency: "BRL" }) });
    const entry = wallet.credit(money, crypto.randomUUID());
    em.persist([wallet, entry]);
    await em.flush();

    const dto = {
      providerId: 'prov-c',
      externalTransactionId: 'ext-rollback',
      idempotencyKey: 'idemp-roll-1',
      payloadHash: 'hash-roll-1',
      walletId,
      playerId: 'player-c',
      roundId: 'r-c',
      gameId: 'g-c',
      kind: WagerTransactionKind.Rollback,
      money: Money.from({ amount: '50.00', currency: 'BRL' }),
      referenceExternalTransactionId: 'ext-bet-missing',
    };

    const result = await useCase.execute(dto);
    expect(result.status).toBe('PENDING_REFERENCE');

    em.clear();
    const finalWallet = await em.findOneOrFail(Wallet, { id: walletId });
    expect(finalWallet.balance.toJSON().amount).toBe('100.00');

    await verifyLedgerConsistency(walletId, em);
  });
});
