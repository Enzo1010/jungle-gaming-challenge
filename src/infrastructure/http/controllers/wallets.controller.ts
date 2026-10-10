import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { CreateWalletDto } from '../dto/create-wallet.dto.js';
import { NoOpAuthGuard } from '../guards/no-op-auth.guard.js';
import { EntityManager } from '@mikro-orm/core';
import { Wallet } from '../../../domain/entities/wallet.js';
import { WalletLedgerEntry, LedgerDirection } from '../../../domain/entities/wallet-ledger-entry.js';
import { Money } from '../../../domain/value-objects/money.js';
import * as crypto from 'node:crypto';
import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/process-wager-transaction.use-case.js';
import { PayloadHasher } from '../../../application/utils/payload-hasher.js';
import { WagerTransactionKind } from '../../../domain/entities/wager-transaction.js';

@Controller('wallets')
@UseGuards(NoOpAuthGuard)
export class WalletsController {
  constructor(
    private readonly em: EntityManager,
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
  ) {}

  @Post()
  async createWallet(@Body() dto: CreateWalletDto) {
    const id = crypto.randomUUID();
    // initialBalance creates the wallet with 0 balance, then we fund it via OPENING.
    const money = Money.from({ amount: dto.initialBalance.amount, currency: dto.initialBalance.currency });
    
    // Create wallet with 0 balance
    const wallet = Wallet.open({ id, playerId: dto.playerId, initialBalance: Money.from({ amount: '0.00', currency: money.currency }) });

    await this.em.transactional(async (tx) => {
       tx.persist(wallet);
    });

    if (money.toJSON().amount !== '0.00') {
       const providerId = 'system';
       const externalTransactionId = `open_${id}`;
       const idempotencyKey = `open_${id}`;
       const payloadHash = PayloadHasher.generate({
         providerId,
         externalTransactionId,
         playerId: dto.playerId,
         walletId: id,
         roundId: 'N/A',
         gameId: 'N/A',
         kind: WagerTransactionKind.Opening,
         money,
       });

       await this.processWagerUseCase.execute({
         providerId,
         externalTransactionId,
         idempotencyKey,
         payloadHash,
         walletId: id,
         playerId: dto.playerId,
         roundId: 'N/A',
         gameId: 'N/A',
         kind: WagerTransactionKind.Opening,
         money,
         isInternal: true,
       });
    }

    // Refresh wallet to get the actual balance
    const updatedWallet = await this.em.findOneOrFail(Wallet, { id }, { refresh: true });

    return {
       id: updatedWallet.id,
       playerId: updatedWallet.playerId,
       balance: updatedWallet.balance.toJSON()
    };
  }

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string) {
    const wallet = await this.em.findOneOrFail(Wallet, { id: walletId });
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }

  @Get(':walletId/ledger')
  async getLedger(@Param('walletId') walletId: string) {
    const entries = await this.em.find(WalletLedgerEntry, { walletId }, { orderBy: { createdAt: 'desc' } });
    return entries;
  }

  @Post(':walletId/reconciliation')
  async reconcile(@Param('walletId') walletId: string) {
    const wallet = await this.em.findOneOrFail(Wallet, { id: walletId });
    const entries = await this.em.find(WalletLedgerEntry, { walletId });

    let sum = Money.from({ amount: '0.00', currency: wallet.currency });
    for (const entry of entries) {
      if (entry.direction === LedgerDirection.Credit) {
        sum = sum.add(entry.money);
      } else {
        sum = sum.subtract(entry.money);
      }
    }

    const difference = wallet.balance.subtract(sum);

    return {
       walletId: wallet.id,
       storedBalance: wallet.balance.toJSON(),
       calculatedBalance: sum.toJSON(),
       difference: difference.toJSON()
    };
  }
}
