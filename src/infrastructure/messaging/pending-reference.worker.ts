import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager, RequestContext } from '@mikro-orm/core';
import { WagerTransaction, WagerTransactionStatus, WagerTransactionKind } from '../../domain/entities/wager-transaction.js';
import { Wallet } from '../../domain/entities/wallet.js';
import { WalletLedgerEntry, LedgerDirection } from '../../domain/entities/wallet-ledger-entry.js';
import { OutboxMessage } from '../../domain/entities/outbox-message.js';
import { WagerTransactionRejectedEvent } from '../../domain/events/wager-transaction-rejected.event.js';
import { WagerTransactionProcessedEvent } from '../../domain/events/wager-transaction-processed.event.js';
import { WalletBalanceChangedEvent } from '../../domain/events/wallet-balance-changed.event.js';
import { InsufficientFundsError, ReversalValidationError, ReversalNegativeBalanceError } from '../../domain/errors/domain.error.js';
import * as crypto from 'node:crypto';

@Injectable()
export class PendingReferenceWorker {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private isProcessing = false;

  constructor(private readonly em: EntityManager) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await RequestContext.create(this.em, async () => {
        const em = this.em.fork({ clear: true });

        await em.transactional(async (tx) => {
          // Retrieve transactions in PENDING_REFERENCE state using SKIP LOCKED inside transaction
          const rows: { id: string }[] = await (tx as any).execute(
            `SELECT id FROM wager_transactions 
             WHERE status = 'PENDING_REFERENCE' 
             FOR UPDATE SKIP LOCKED`
          );

          if (rows.length === 0) return;

          const now = new Date();
          const ttlMs = 5 * 60 * 1000; // 5 minutes TTL

          for (const row of rows) {
            try {
              const transaction = await tx.findOneOrFail(WagerTransaction, { id: row.id });
              
              const refTx = await tx.findOne(WagerTransaction, { 
                externalTransactionId: transaction.referenceExternalTransactionId,
                providerId: transaction.providerId 
              });

              if (refTx) {
                // Process domain rules for Reversal
                let ledgerEntry: WalletLedgerEntry | null = null;
                const wallet = await tx.findOneOrFail(Wallet, { id: transaction.walletId });

                if (refTx.status !== WagerTransactionStatus.Processed) {
                  throw new ReversalValidationError('Reference transaction is not PROCESSED');
                }
                if (refTx.walletId !== transaction.walletId ||
                    refTx.playerId !== transaction.playerId ||
                    refTx.roundId !== transaction.roundId ||
                    refTx.money.currency !== transaction.money.currency) {
                  throw new ReversalValidationError('Reference properties do not match');
                }
                if (!refTx.money.equals(transaction.money)) {
                  throw new ReversalValidationError('Reference transaction amount does not match');
                }
                if (transaction.kind === WagerTransactionKind.Refund && refTx.kind !== WagerTransactionKind.Bet) {
                  throw new ReversalValidationError('REFUND can only reference a BET');
                }
                if (transaction.kind === WagerTransactionKind.Rollback && 
                    ![WagerTransactionKind.Bet, WagerTransactionKind.Win, WagerTransactionKind.Refund].includes(refTx.kind)) {
                  throw new ReversalValidationError('ROLLBACK can only reference BET, WIN or REFUND');
                }

                const existingReversal = await tx.findOne(WagerTransaction, {
                  referenceExternalTransactionId: transaction.referenceExternalTransactionId,
                  providerId: transaction.providerId,
                  kind: { $in: [WagerTransactionKind.Refund, WagerTransactionKind.Rollback] },
                  status: WagerTransactionStatus.Processed,
                  id: { $ne: transaction.id }
                });
                
                if (existingReversal) {
                  throw new ReversalValidationError('A processed reversal already exists for this reference');
                }

                if (transaction.kind === WagerTransactionKind.Refund) {
                  ledgerEntry = wallet.credit(transaction.money, transaction.id);
                } else {
                  const dir = transaction.ledgerDirectionFor(refTx);
                  if (dir === LedgerDirection.Debit) {
                    try {
                      ledgerEntry = wallet.debit(transaction.money, transaction.id);
                    } catch (err) {
                      if (err instanceof InsufficientFundsError) {
                        throw new ReversalNegativeBalanceError(err.message);
                      }
                      throw err;
                    }
                  } else {
                    ledgerEntry = wallet.credit(transaction.money, transaction.id);
                  }
                }
                
                transaction.markProcessed(refTx.id, now);
                
                // Publish Processed Event
                const processedEvent = new WagerTransactionProcessedEvent({
                  eventId: crypto.randomUUID(),
                  aggregateId: transaction.id,
                  correlationId: transaction.idempotencyKey,
                  occurredAt: now,
                  data: {
                    transactionId: transaction.id,
                    providerId: transaction.providerId,
                    externalTransactionId: transaction.externalTransactionId,
                    status: transaction.status,
                    money: transaction.money.toJSON(),
                  }
                });
                
                const balanceChangedEvent = new WalletBalanceChangedEvent({
                  eventId: crypto.randomUUID(),
                  aggregateId: wallet.id,
                  correlationId: transaction.idempotencyKey,
                  occurredAt: now,
                  data: {
                    walletId: wallet.id,
                    transactionId: transaction.id,
                    direction: ledgerEntry.direction,
                    money: ledgerEntry.money.toJSON(),
                    balanceBefore: ledgerEntry.balanceBefore.toJSON(),
                    balanceAfter: ledgerEntry.balanceAfter.toJSON(),
                    walletVersion: wallet.version,
                  }
                });

                tx.persist([transaction, wallet, ledgerEntry, OutboxMessage.enqueue(processedEvent), OutboxMessage.enqueue(balanceChangedEvent)]);
                this.logger.log(`Transaction ${transaction.id} processed from PENDING_REFERENCE`);

              } else {
                // If reference not found and TTL expired
                const timeInPending = now.getTime() - transaction.createdAt.getTime();
                if (timeInPending > ttlMs) {
                  transaction.reject('REFERENCE_NOT_FOUND');
                  
                  const rejectedEvent = new WagerTransactionRejectedEvent({
                    eventId: crypto.randomUUID(),
                    aggregateId: transaction.id,
                    correlationId: transaction.idempotencyKey,
                    occurredAt: now,
                    data: {
                      transactionId: transaction.id,
                      providerId: transaction.providerId,
                      externalTransactionId: transaction.externalTransactionId,
                      status: transaction.status,
                      failureCode: 'REFERENCE_NOT_FOUND',
                      money: transaction.money.toJSON()
                    }
                  });
                  
                  tx.persist([transaction, OutboxMessage.enqueue(rejectedEvent)]);
                  this.logger.warn(`Transaction ${transaction.id} rejected due to TTL (REFERENCE_NOT_FOUND)`);
                }
              }
            } catch (err) {
              if (err instanceof InsufficientFundsError || err instanceof ReversalNegativeBalanceError || err instanceof ReversalValidationError) {
                const transaction = await tx.findOneOrFail(WagerTransaction, { id: row.id });
                let code = 'UNKNOWN_VALIDATION_ERROR';
                if (err instanceof InsufficientFundsError) code = 'INSUFFICIENT_FUNDS';
                if (err instanceof ReversalNegativeBalanceError) code = 'NEGATIVE_BALANCE_ON_REVERSAL';
                if (err instanceof ReversalValidationError) code = 'REVERSAL_VALIDATION_FAILED';
                
                transaction.reject(code);
                
                const rejectedEvent = new WagerTransactionRejectedEvent({
                  eventId: crypto.randomUUID(),
                  aggregateId: transaction.id,
                  correlationId: transaction.idempotencyKey,
                  occurredAt: now,
                  data: {
                    transactionId: transaction.id,
                    providerId: transaction.providerId,
                    externalTransactionId: transaction.externalTransactionId,
                    status: transaction.status,
                    failureCode: code,
                    money: transaction.money.toJSON()
                  }
                });
                
                tx.persist([transaction, OutboxMessage.enqueue(rejectedEvent)]);
              } else {
                this.logger.error(`Error processing pending reference ${row.id}: ${err}`);
              }
            }
          }
        });
      });
    } catch (e) {
      this.logger.error(`Error in PendingReferenceWorker: ${e}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
