import { Migration } from '@mikro-orm/migrations';

export class Migration20261010000000 extends Migration {

  async up(): Promise<void> {
    // Adiciona restrições no ledger para garantir integridade matemática e positividade (C11)
    this.addSql('ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "check_money_positive" CHECK (money > 0);');
    this.addSql('ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "check_balance_after_positive" CHECK (balance_after >= 0);');

    // Torna a tabela wallet_ledger_entries verdadeiramente imutável através de um TRIGGER (C11)
    this.addSql(`
      CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries table is append-only. UPDATE and DELETE are strictly forbidden.';
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER prevent_wallet_ledger_entries_mutation
      BEFORE UPDATE OR DELETE ON "wallet_ledger_entries"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_ledger_mutation();
    `);
  }

  async down(): Promise<void> {
    this.addSql('DROP TRIGGER IF EXISTS prevent_wallet_ledger_entries_mutation ON "wallet_ledger_entries";');
    this.addSql('DROP FUNCTION IF EXISTS prevent_ledger_mutation();');
    this.addSql('ALTER TABLE "wallet_ledger_entries" DROP CONSTRAINT IF EXISTS "check_money_positive";');
    this.addSql('ALTER TABLE "wallet_ledger_entries" DROP CONSTRAINT IF EXISTS "check_balance_after_positive";');
  }

}
