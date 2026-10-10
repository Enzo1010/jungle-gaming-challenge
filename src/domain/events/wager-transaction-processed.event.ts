import { IntegrationEvent, IntegrationEventProps } from '../entities/integration-event.js';
import { WagerTransactionStatus } from '../entities/wager-transaction.js';
import { MoneyProps } from '../value-objects/money.js';

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  status: WagerTransactionStatus;
  money: MoneyProps;
}

export class WagerTransactionProcessedEvent extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  constructor(props: IntegrationEventProps<WagerTransactionProcessedData>) {
    super(props);
  }
}
