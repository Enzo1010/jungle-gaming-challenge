import { Module } from '@nestjs/common';
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { ProcessWagerTransactionUseCase } from './application/use-cases/process-wager-transaction.use-case.js';

@Module({
  providers: [
    makeCounterProvider({
      name: 'wager_transactions_total',
      help: 'Total wager transactions processed',
      labelNames: ['status', 'kind'],
    }),
    ProcessWagerTransactionUseCase,
  ],
  exports: [ProcessWagerTransactionUseCase],
})
export class DomainModule {}
