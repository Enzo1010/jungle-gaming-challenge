import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EntityManager, RequestContext } from '@mikro-orm/core';
import { SqsService } from './sqs.service.js';
import { ProcessWagerTransactionUseCase, ProcessWagerDto } from '../../application/use-cases/process-wager-transaction.use-case.js';
import { ConcurrencyConflictError } from '../../application/errors/application.error.js';
import { Money } from '../../domain/value-objects/money.js';
import { PayloadHasher } from '../../application/utils/payload-hasher.js';

export const WAGER_CONSUMER_NAME = 'wager-processor';

@Injectable()
export class SqsConsumerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerWorker.name);
  private readonly queueUrl = `${process.env.AWS_SQS_ENDPOINT || 'http://127.0.0.1:4566'}/000000000000/wager-transactions.fifo`;
  private isRunning = false;
  private activeMessageCount = 0;

  constructor(
    private readonly em: EntityManager,
    private readonly sqsService: SqsService,
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
  ) {}

  onModuleInit() {
    this.isRunning = true;
    this.poll();
  }

  async onModuleDestroy() {
    this.isRunning = false;
    this.logger.log('Shutting down SQS Consumer... Waiting for active messages to finish.');
    while (this.activeMessageCount > 0) {
      await new Promise(res => setTimeout(res, 100));
    }
    this.logger.log('SQS Consumer shutdown complete.');
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const messages = await this.sqsService.receiveMessages(this.queueUrl, 10, 20); // Long polling (20s)
        for (const message of messages) {
          // Contexto MikroORM isolado por mensagem: Identity Map novo, descartado no fim (C3/C4).
          await RequestContext.create(this.em, () => this.processMessage(message));
        }
      } catch (error) {
        this.logger.error(`Error pulling from SQS: ${error}`);
        await new Promise(res => setTimeout(res, 5000));
      }
    }
  }

  private async processMessage(sqsMessage: any) {
    this.activeMessageCount++;
    try {
      let envelope: any;
      try {
        envelope = JSON.parse(sqsMessage.Body);
      } catch (e) {
      this.logger.error(`Invalid JSON. Acking message to drop it.`);
      await this.sqsService.deleteMessage(this.queueUrl, sqsMessage.ReceiptHandle);
      return;
    }

    if (!envelope.messageId || !envelope.type || !envelope.data) {
      this.logger.error(`Invalid envelope format. Missing messageId, type, or data. Acking to drop.`);
      await this.sqsService.deleteMessage(this.queueUrl, sqsMessage.ReceiptHandle);
      return;
    }

    const payload = envelope.data;
    const messageId: string = envelope.messageId;

    try {
      const money = Money.positive({ amount: payload.money?.amount, currency: payload.money?.currency });
      const payloadHash = PayloadHasher.generate({
        providerId: payload.providerId,
        externalTransactionId: payload.externalTransactionId,
        playerId: payload.playerId,
        walletId: payload.walletId,
        roundId: payload.roundId,
        gameId: payload.gameId,
        kind: payload.kind,
        money,
        referenceExternalTransactionId: payload.referenceExternalTransactionId,
      });

      const dto: ProcessWagerDto = {
        providerId: payload.providerId,
        externalTransactionId: payload.externalTransactionId,
        idempotencyKey: payload.idempotencyKey,
        payloadHash,
        walletId: payload.walletId,
        playerId: payload.playerId,
        roundId: payload.roundId,
        gameId: payload.gameId,
        kind: payload.kind,
        money,
        referenceExternalTransactionId: payload.referenceExternalTransactionId,
        inbox: {
          messageId,
          consumerName: WAGER_CONSUMER_NAME,
          payloadHash,
        },
      };

      const result = await this.processWagerUseCase.execute(dto);
      if (result.duplicateMessage) {
        this.logger.debug(`Message ${messageId} already processed (Inbox deduplication).`);
      }

      await this.sqsService.deleteMessage(this.queueUrl, sqsMessage.ReceiptHandle);

    } catch (error: any) {
      // Erros de Infraestrutura (ConnectionException, timeout, concurrency) -> Nack
      if (error instanceof ConcurrencyConflictError || error.name === 'ConnectionException' || error.name === 'DriverException') {
        this.logger.warn(`Transient infra/concurrency error for message ${messageId}. Nack.`);
        // Don't delete, let visibility timeout handle it
      } else {
        // Erros de Negócio -> Ack (and ensure it's saved as REJECTED if it reached the Use Case)
        this.logger.error(`Terminal/Business error processing message ${messageId}: ${error}`);
        await this.sqsService.deleteMessage(this.queueUrl, sqsMessage.ReceiptHandle);
      }
    }
    } finally {
      this.activeMessageCount--;
    }
  }
}
