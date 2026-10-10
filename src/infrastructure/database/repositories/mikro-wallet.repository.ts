import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { WalletRepository } from '../../../domain/repositories/wallet.repository.js';
import { Wallet } from '../../../domain/entities/wallet.js';

@Injectable()
export class MikroWalletRepository implements WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    return this.em.findOne(Wallet, { id });
  }

  async save(wallet: Wallet): Promise<void> {
    this.em.persist(wallet);
    // Note: Calling flush() here can break the Unit of Work if multiple repositories 
    // are involved in the same transaction. Usually, flush() is called by the UoW/Handler.
    // However, since the requirement states "O save aqui pode ser apenas o flush() do UoW, 
    // caso uses o pattern persist/flush", we will just persist. The UoW handles the flush.
  }
}
