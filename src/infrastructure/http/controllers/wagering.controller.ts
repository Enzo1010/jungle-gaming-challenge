import { Controller, Post, Get, Body, Headers, Param, BadRequestException, UseGuards } from '@nestjs/common';
import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/process-wager-transaction.use-case.js';
import { SubmitWagerDto } from '../dto/submit-wager.dto.js';
import { NoOpAuthGuard } from '../guards/no-op-auth.guard.js';
import { Money } from '../../../domain/value-objects/money.js';
import { PayloadHasher } from '../../../application/utils/payload-hasher.js';
import { EntityManager } from '@mikro-orm/core';
import { WagerTransaction } from '../../../domain/entities/wager-transaction.js';

@Controller()
@UseGuards(NoOpAuthGuard)
export class WageringController {
  constructor(
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
    private readonly em: EntityManager,
  ) {}

  @Post('wagering/transactions')
  async submitWager(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SubmitWagerDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }

    const money = Money.positive({ amount: dto.money.amount, currency: dto.money.currency });
    const payloadHash = PayloadHasher.generate({
      ...dto,
      money,
    });

    const result = await this.processWagerUseCase.execute({
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      idempotencyKey,
      payloadHash,
      walletId: dto.walletId,
      playerId: dto.playerId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      money,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    });

    return {
      transactionId: result.transactionId,
      status: result.status,
      balance: result.balance.toJSON(),
      idempotentReplay: result.idempotentReplay,
    };
  }

  @Get('wagering/transactions/:transactionId')
  async getTransaction(@Param('transactionId') transactionId: string) {
    return this.em.findOneOrFail(WagerTransaction, { id: transactionId });
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  async getTransactionByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ) {
    return this.em.findOneOrFail(WagerTransaction, { providerId, externalTransactionId });
  }
}
