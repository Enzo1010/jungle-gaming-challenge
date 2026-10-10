import { EntityManager, OptimisticLockError, UniqueConstraintViolationException, DriverException } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus, isExternallySubmittableKind } from '../../domain/entities/wager-transaction.js';
import { Wallet } from '../../domain/entities/wallet.js';
import { WalletLedgerEntry, LedgerDirection } from '../../domain/entities/wallet-ledger-entry.js';
import { OutboxMessage } from '../../domain/entities/outbox-message.js';
import { InboxMessage } from '../../domain/entities/inbox-message.js';
import { WagerTransactionProcessedEvent } from '../../domain/events/wager-transaction-processed.event.js';
import { WalletBalanceChangedEvent } from '../../domain/events/wallet-balance-changed.event.js';
import { Money } from '../../domain/value-objects/money.js';
import { ForbiddenTransactionKindError, InsufficientFundsError, ReversalValidationError, ReversalNegativeBalanceError, CurrencyMismatchError, InvalidTransactionStateError } from '../../domain/errors/domain.error.js';
import {
  IdempotencyConflictError,
  ConcurrencyConflictError,
  InboxMessageConflictError,
  WalletNotFoundError,
} from '../errors/application.error.js';
import { FatalSystemIntegrityError } from '../errors/fatal-system-integrity.error.js';
import * as crypto from 'node:crypto';

/**
 * Presente apenas quando a entrada é assíncrona (SQS). O registo de inbox é
 * gravado DENTRO da mesma transação SQL da alteração financeira (§6.5, §11).
 */
export interface InboxContext {
  messageId: string;
  consumerName: string;
  payloadHash: string;
}

export interface ProcessWagerDto {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  inbox?: InboxContext;
  isInternal?: boolean;
}

export interface ProcessWagerResult {
  transactionId: string;
  status: string;
  balance: Money;
  idempotentReplay: boolean;
  /** true quando (consumerName, messageId) já tinha sido consumido — nada foi reprocessado. */
  duplicateMessage: boolean;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
  private readonly logger = new Logger(ProcessWagerTransactionUseCase.name);

  constructor(
    private readonly em: EntityManager,
    @InjectMetric('wager_transactions_total') private readonly wagerCounter: Counter<string>,
  ) {}

  async execute(dto: ProcessWagerDto): Promise<ProcessWagerResult> {
    // OPENING é interno; kinds desconhecidos (ex.: vindos da fila sem DTO) também não passam.
    if (!dto.isInternal && !isExternallySubmittableKind(dto.kind)) {
      throw new ForbiddenTransactionKindError(String(dto.kind));
    }

    this.logger.log({ msg: 'Processing wager transaction', correlationId: dto.idempotencyKey, walletId: dto.walletId, messageId: dto.inbox?.messageId });
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
      // Identity Map NOVO por tentativa (C3/C4):
      // - nunca herda entidades do EM global/pai → a Wallet é sempre lida da BD (sem stale reads);
      // - o merge pós-commit do `transactional` acontece neste fork descartável → nada acumula no EM global.
      const em = this.em.fork({ clear: true });

      try {
        return await em.transactional(async (tx) => {
          // 0. Barreira de inbox (apenas SQS) — primeiro statement da transação.
          //    Um consumidor concorrente com o mesmo messageId fica bloqueado no índice único
          //    até esta transação terminar: commit → DO NOTHING (duplicado); rollback → assume ele.
          if (dto.inbox) {
            const claimed = await this.claimInbox(tx, dto.inbox);
            if (!claimed) {
              return this.replayConsumedMessage(tx, dto, dto.inbox);
            }
          }

          // 1. Check Idempotency
          const existingTx = await tx.findOne(WagerTransaction, { idempotencyKey: dto.idempotencyKey });
          
          if (existingTx) {
            return this.replay(tx, existingTx, dto, false);
          }

          // 2. Load Wallet
          const wallet = await tx.findOne(Wallet, { id: dto.walletId });
          if (!wallet) {
            throw new WalletNotFoundError(dto.walletId);
          }

          // 3. Create Transaction Entity
          const transaction = WagerTransaction.create({
            id: crypto.randomUUID(),
            providerId: dto.providerId,
            externalTransactionId: dto.externalTransactionId,
            idempotencyKey: dto.idempotencyKey,
            payloadHash: dto.payloadHash,
            walletId: dto.walletId,
            playerId: dto.playerId,
            roundId: dto.roundId,
            gameId: dto.gameId,
            kind: dto.kind,
            money: dto.money,
            referenceExternalTransactionId: dto.referenceExternalTransactionId,
          });

          const entitiesToPersist: any[] = [transaction];
          let ledgerEntry: WalletLedgerEntry | null = null;
          let isRejected = false;

          // 4. Process Domain Rules
          try {
            if (transaction.requiresReference()) {
              const refTx = await tx.findOne(WagerTransaction, { 
                externalTransactionId: dto.referenceExternalTransactionId,
                providerId: dto.providerId 
              });

              if (refTx) {
                if (refTx.status !== 'PROCESSED') {
                  throw new ReversalValidationError('Reference transaction is not PROCESSED');
                }
                if (refTx.walletId !== transaction.walletId ||
                    refTx.playerId !== transaction.playerId ||
                    refTx.roundId !== transaction.roundId ||
                    refTx.money.currency !== transaction.money.currency) {
                  throw new ReversalValidationError('Reference properties (walletId, playerId, roundId, currency) do not match');
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
                  referenceExternalTransactionId: dto.referenceExternalTransactionId,
                  providerId: dto.providerId,
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
                  // Rollback
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
                transaction.markProcessed(refTx.id, new Date());
              } else {
                transaction.markPendingReference();
              }
            } else if (transaction.kind !== WagerTransactionKind.Loss) {
              if (transaction.kind === WagerTransactionKind.Bet) {
                ledgerEntry = wallet.debit(transaction.money, transaction.id);
              } else {
                ledgerEntry = wallet.credit(transaction.money, transaction.id);
              }
              transaction.markProcessed(undefined, new Date());
            } else {
              // LOSS transaction
              transaction.markProcessed(undefined, new Date());
            }
          } catch (error) {
            if (error instanceof InsufficientFundsError) {
              transaction.reject('INSUFFICIENT_FUNDS');
              isRejected = true;
            } else if (error instanceof ReversalNegativeBalanceError) {
              transaction.reject('NEGATIVE_BALANCE_ON_REVERSAL');
              isRejected = true;
            } else if (error instanceof ReversalValidationError) {
              transaction.reject('REVERSAL_VALIDATION_FAILED');
              isRejected = true;
            } else if (error instanceof CurrencyMismatchError) {
              transaction.reject('CURRENCY_MISMATCH');
              isRejected = true;
            } else {
              throw error; // Bubble up other unhandled errors
            }
          }

          if (ledgerEntry && !isRejected && transaction.status === 'PROCESSED') {
            entitiesToPersist.push(wallet);
            entitiesToPersist.push(ledgerEntry);
          }

          // 5. Transactional Outbox
          const now = new Date();
          
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
          entitiesToPersist.push(OutboxMessage.enqueue(processedEvent));

          if (ledgerEntry && !isRejected && transaction.status === 'PROCESSED') {
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
            entitiesToPersist.push(OutboxMessage.enqueue(balanceChangedEvent));
          }

          // 6. Final Persist inside UoW
          tx.persist(entitiesToPersist);

          this.wagerCounter.inc({ status: transaction.status, kind: transaction.kind });
          this.logger.log({ msg: 'Wager transaction processed successfully', correlationId: dto.idempotencyKey, transactionId: transaction.id, status: transaction.status });

          return {
            transactionId: transaction.id,
            status: transaction.status,
            balance: wallet.balance,
            idempotentReplay: false,
            duplicateMessage: false,
          };
        });
      } catch (error) {
        if (error instanceof UniqueConstraintViolationException) {
          const replayFork = this.em.fork({ clear: true });
          const existingTx = await replayFork.findOne(WagerTransaction, { idempotencyKey: dto.idempotencyKey });
          if (existingTx) {
            return await this.replay(replayFork, existingTx, dto, false);
          }
          throw new IdempotencyConflictError(dto.idempotencyKey);
        }
        if (error instanceof OptimisticLockError) {
          attempts++;
          if (attempts >= maxRetries) {
            throw new ConcurrencyConflictError(dto.walletId);
          }
          // Retry
        } else if (error instanceof DriverException && (error.message?.includes('wallet_ledger_entries table is append-only') || error.message?.includes('strictly forbidden'))) {
          throw new FatalSystemIntegrityError('CRITICAL: Attempted to mutate immutable ledger. Transaction aborted by database trigger.');
        } else {
          throw error;
        }
      } finally {
        // Liberta as referências do fork desta tentativa (o próximo retry abre um novo).
        em.clear();
      }
    }
    
    throw new ConcurrencyConflictError(dto.walletId);
  }

  /**
   * Regista a mensagem no inbox dentro da transação corrente.
   * Devolve `false` se (consumerName, messageId) já existir (mensagem já consumida).
   *
   * Usa SQL explícito porque o UoW do MikroORM só faria o INSERT no flush final e um
   * UNIQUE violado abortaria a transação PostgreSQL inteira. Com `ON CONFLICT DO NOTHING`
   * a transação continua válida e o duplicado é detetado ANTES de qualquer efeito.
   * O `ctx` é obrigatório: sem ele o driver usa outra conexão do pool, fora da transação.
   */
  private async claimInbox(tx: EntityManager, inbox: InboxContext): Promise<boolean> {
    const now = new Date();
    const message = InboxMessage.receive({
      messageId: inbox.messageId,
      consumerName: inbox.consumerName,
      payloadHash: inbox.payloadHash,
      receivedAt: now,
    });
    message.markProcessed(now);

    const rows: { message_id: string }[] = await tx.getConnection().execute(
      `INSERT INTO inbox_messages (message_id, consumer_name, payload_hash, received_at, processed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (consumer_name, message_id) DO NOTHING
       RETURNING message_id`,
      [message.messageId, message.consumerName, message.payloadHash, message.receivedAt, message.processedAt],
      'all',
      tx.getTransactionContext(),
    );

    return rows.length === 1;
  }

  /** Mensagem já consumida: devolve o resultado da transação original sem reprocessar. */
  private async replayConsumedMessage(tx: EntityManager, dto: ProcessWagerDto, inbox: InboxContext): Promise<ProcessWagerResult> {
    this.logger.log({ msg: 'Duplicate message (inbox)', messageId: inbox.messageId, correlationId: dto.idempotencyKey });

    const existingTx = await tx.findOne(WagerTransaction, { idempotencyKey: dto.idempotencyKey });
    if (!existingTx) {
      throw new InboxMessageConflictError(inbox.consumerName, inbox.messageId);
    }
    return this.replay(tx, existingTx, dto, true);
  }

  private async replay(
    tx: EntityManager,
    existingTx: WagerTransaction,
    dto: ProcessWagerDto,
    duplicateMessage: boolean,
  ): Promise<ProcessWagerResult> {
    if (!existingTx.matchesPayload(dto.payloadHash)) {
      throw new IdempotencyConflictError(dto.idempotencyKey);
    }

    const ledgerEntry = await tx.findOne(WalletLedgerEntry, { transactionId: existingTx.id });
    let balance: Money;
    
    if (ledgerEntry) {
      balance = ledgerEntry.balanceAfter;
    } else {
      const walletForReplay = await tx.findOne(Wallet, { id: existingTx.walletId });
      if (!walletForReplay) throw new WalletNotFoundError(existingTx.walletId);
      balance = walletForReplay.balance;
    }

    return {
      transactionId: existingTx.id,
      status: existingTx.status,
      balance,
      idempotentReplay: true,
      duplicateMessage,
    };
  }
}
