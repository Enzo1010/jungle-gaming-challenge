import { IntegrationEvent, IntegrationEventProps } from '../entities/integration-event.js';
import { WagerTransactionStatus } from '../entities/wager-transaction.js';
import { MoneyProps } from '../value-objects/money.js';

export interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  status: WagerTransactionStatus;
  money: MoneyProps;
  failureCode: string;
}

export class WagerTransactionRejectedEvent extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  constructor(props: IntegrationEventProps<WagerTransactionRejectedData>) {
    super(props);
  }
}
