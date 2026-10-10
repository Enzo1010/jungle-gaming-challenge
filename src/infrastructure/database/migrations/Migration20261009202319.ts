import { Migration } from '@mikro-orm/migrations';

export class Migration20261009202319 extends Migration {

  override name = 'Migration20261009202319';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_messages" ("message_id" varchar(255) not null, "consumer_name" varchar(255) not null, "payload_hash" varchar(255) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, primary key ("message_id", "consumer_name"));`);
    this.addSql(`alter table "inbox_messages" add constraint "inbox_messages_consumer_name_message_id_unique" unique ("consumer_name", "message_id");`);

    this.addSql(`create table "outbox_messages" ("id" uuid not null, "aggregate_id" varchar(255) not null, "event_type" varchar(255) not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null, "next_attempt_at" timestamptz null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_messages_next_attempt_at_index" on "outbox_messages" ("next_attempt_at");`);
    this.addSql(`create index "outbox_messages_published_at_index" on "outbox_messages" ("published_at");`);

    this.addSql(`create table "wager_transactions" ("id" uuid not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(255) not null, "wallet_id" varchar(255) not null, "player_id" varchar(255) not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" text not null, "money" decimal(19,2) not null, "reference_external_transaction_id" varchar(255) null, "created_at" timestamptz not null, "status" text not null, "reference_transaction_id" varchar(255) null, "failure_code" varchar(255) null, "processed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_idempotency_key_unique" unique ("idempotency_key");`);

    this.addSql(`create table "wallets" ("id" uuid not null, "player_id" varchar(255) not null, "currency" varchar(255) not null, "balance" decimal(19,2) not null, "version" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");`);

    this.addSql(`create table "wallet_ledger_entries" ("id" uuid not null, "wallet_id" varchar(255) not null, "transaction_id" varchar(255) not null, "direction" text not null, "money" decimal(19,2) not null, "balance_before" decimal(19,2) not null, "balance_after" decimal(19,2) not null, "created_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);

    this.addSql(`alter table "wallets" add constraint "wallet_balance_check" check (balance >= 0);`);

    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_direction_check" check ("direction" in ('DEBIT', 'CREDIT'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
    this.addSql(`drop table if exists "outbox_messages" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
    this.addSql(`drop table if exists "wallets" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
  }

}
