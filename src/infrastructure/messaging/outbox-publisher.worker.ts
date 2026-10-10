import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/core';
import { SqsService } from './sqs.service.js';
import { OutboxMessage } from '../../domain/entities/outbox-message.js';

@Injectable()
export class OutboxPublisherWorker {
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private readonly queueUrl = `${process.env.AWS_SQS_ENDPOINT || 'http://127.0.0.1:4566'}/000000000000/wagering-events.fifo`;

  constructor(
    private readonly em: EntityManager,
    private readonly sqsService: SqsService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron() {
    // Identity Map novo por ciclo: nada fica retido no EM global entre execuções (C4).
    const em = this.em.fork({ clear: true });

    try {
      await em.transactional(async (tx) => {
        const now = new Date();

        // 'FOR UPDATE SKIP LOCKED' para publishers concorrentes.
        // O `ctx` (transaction context) é OBRIGATÓRIO: sem ele, `getConnection().execute()`
        // corre noutra conexão do pool em autocommit e o lock é libertado de imediato —
        // dois publishers enviariam o mesmo lote.
        const res: { id: string }[] = await tx.getConnection().execute(
          `
          SELECT id FROM outbox_messages 
          WHERE published_at IS NULL 
            AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
          ORDER BY occurred_at ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        `,
          [now],
          'all',
          tx.getTransactionContext(),
        );

        if (res.length === 0) return;

        const ids = res.map((row) => row.id);
        // Hydrate the locked entities (mesma transação → mesmas linhas bloqueadas)
        const messages = await tx.find(OutboxMessage, { id: { $in: ids } });

        for (const message of messages) {
          try {
            await this.sqsService.sendMessage(
              this.queueUrl,
              JSON.stringify(message.payload),
              message.aggregateId, // Group by aggregateId (e.g., walletId or transactionId) ensures FIFO order per aggregate
              message.id           // Deduplication is handled by message.id
            );
            message.markPublished(new Date());
          } catch (error) {
            this.logger.error(`Failed to publish message ${message.id}: ${error}`);
            message.scheduleRetry(new Date());
          }
        }
        
        // tx.persistAndFlush is implicitly handled at the end of the transactional block.
      });
    } catch (error) {
      this.logger.error(`Outbox worker failed during execution: ${error}`);
    } finally {
      em.clear();
    }
  }
}
