import { Options, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { WalletSchema } from './infrastructure/database/schemas/wallet.schema.js';
import { WagerTransactionSchema } from './infrastructure/database/schemas/wager-transaction.schema.js';
import { WalletLedgerEntrySchema } from './infrastructure/database/schemas/wallet-ledger-entry.schema.js';
import { InboxMessageSchema } from './infrastructure/database/schemas/inbox-message.schema.js';
import { OutboxMessageSchema } from './infrastructure/database/schemas/outbox-message.schema.js';
import { MoneySchema } from './infrastructure/database/schemas/money.schema.js';

const config: Options = {
  driver: PostgreSqlDriver,
  dbName: process.env.DB_NAME || 'wagering_db',
  user: process.env.DB_USER || 'jungle_user',
  password: process.env.DB_PASSWORD || 'jungle_password',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  entities: [
    WalletSchema,
    WagerTransactionSchema,
    WalletLedgerEntrySchema,
    InboxMessageSchema,
    OutboxMessageSchema,
    MoneySchema,
  ],
  migrations: {
    path: './infrastructure/database/migrations',
    glob: '!(*.d).{js,ts}',
  },
  extensions: [Migrator],
  debug: true,
};

export default config;
