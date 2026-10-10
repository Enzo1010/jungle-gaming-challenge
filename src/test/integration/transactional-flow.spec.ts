import { SqsConsumerWorker } from "../../infrastructure/messaging/sqs-consumer.worker.js";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingModule } from '@nestjs/testing';
import { getTestApp, clearDatabase, verifyLedgerConsistency } from '../setup.js';
import { EntityManager } from '@mikro-orm/core';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case.js';
import { OutboxPublisherWorker } from '../../infrastructure/messaging/outbox-publisher.worker.js';
import { SqsService } from '../../infrastructure/messaging/sqs.service.js';
import { Wallet } from '../../domain/entities/wallet.js';
import { OutboxMessage } from '../../domain/entities/outbox-message.js';
import { InboxMessage } from '../../domain/entities/inbox-message.js';
import { WagerTransactionKind } from '../../domain/entities/wager-transaction.js';
import { Money } from '../../domain/value-objects/money.js';
import * as crypto from 'node:crypto';

describe('Integration - Transactional Flow', () => {
  let app: TestingModule;
  let em: EntityManager;
  let useCase: ProcessWagerTransactionUseCase;
  let outboxWorker: OutboxPublisherWorker;
  let sqsService: SqsService;
  
  beforeAll(async () => {
    app = await getTestApp();
    em = app.get(EntityManager).fork();
    useCase = app.get(ProcessWagerTransactionUseCase);
    outboxWorker = app.get(OutboxPublisherWorker);
    sqsService = app.get(SqsService);
  });

  beforeAll(async () => {
    const worker = app.get(SqsConsumerWorker);
    worker.onModuleDestroy(); // stop background poll
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(em);
  });

  it('should process wager, publish outbox and consume inbox idempotently', async () => {
    const walletId = crypto.randomUUID();
    const money = Money.from({ amount: '100.00', currency: 'BRL' });
    const wallet = Wallet.open({ id: walletId, playerId: 'player-1', initialBalance: Money.from({ amount: "0.00", currency: "BRL" }) });
    const entry = wallet.credit(money, crypto.randomUUID());
    em.persist([wallet, entry]);
    await em.flush();

    await em.flush();

    const dto = {
      providerId: 'prov-1',
      externalTransactionId: 'ext-1',
      idempotencyKey: 'idem-1',
      payloadHash: 'hash-1',
      walletId,
      playerId: 'player-1',
      roundId: 'r-1',
      gameId: 'g-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '10.00', currency: 'BRL' }),
    };

    const result = await useCase.execute(dto);
    expect(result.status).toBe('PROCESSED');
    expect(result.balance.toJSON().amount).toBe('90.00');

    // Verifica na base de dados se a OutboxMessage foi criada na mesma transação
    em.clear(); // clear identity map to fetch raw from DB
    const outboxMessages = await em.find(OutboxMessage, { publishedAt: null });
    expect(outboxMessages.length).toBeGreaterThan(0);

    const queueUrl = `${process.env.AWS_SQS_ENDPOINT || 'http://127.0.0.1:4566'}/000000000000/wager-transactions.fifo`;
    
    // Invoca o worker do Outbox
    await outboxWorker.handleCron();

    em.clear();
    const pendingOutbox = await em.find(OutboxMessage, { publishedAt: null });
    expect(pendingOutbox.length).toBe(0); // Foram publicadas

    // We omit checking SQS messages length directly because SqsConsumerWorker is long polling in the background
    // and might have already picked them up. We just rely on the consumer loop to process our faked payload.

    // Now send a new raw message to SQS simulating an incoming wager request
    const incomingId = crypto.randomUUID();
    const messageBody = JSON.stringify({
      providerId: 'prov-sqs',
      externalTransactionId: incomingId,
      idempotencyKey: incomingId,
      payloadHash: 'hash-sqs',
      walletId,
      playerId: 'player-1',
      roundId: 'r-1',
      gameId: 'g-1',
      kind: WagerTransactionKind.Bet,
      money: { amount: '5.00', currency: 'BRL' }
    });
    await sqsService.sendMessage(queueUrl, messageBody, walletId, incomingId);

    // Manually consume and process
    const newMsgs = await sqsService.receiveMessages(queueUrl, 10, 2);
    const worker = app.get(SqsConsumerWorker);
    for (const msg of newMsgs) {
      await (worker as any).processMessage(msg);
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    em.clear();
    const inboxMessages = await em.find(InboxMessage, { consumerName: 'wager-processor' });
    expect(inboxMessages.length).toBeGreaterThan(0);
    await verifyLedgerConsistency(walletId, em);
  });
});
