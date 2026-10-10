import { IntegrationEvent, IntegrationEventProps } from '../entities/integration-event.js';
import { MoneyProps } from '../value-objects/money.js';
import { LedgerDirection } from '../entities/wallet-ledger-entry.js';

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WalletBalanceChangedEvent extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  constructor(props: IntegrationEventProps<WalletBalanceChangedData>) {
    super(props);
  }
}
