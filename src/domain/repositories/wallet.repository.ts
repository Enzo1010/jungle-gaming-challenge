import { Wallet } from '../entities/wallet.js';

export interface WalletRepository {
  findById(id: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
}
