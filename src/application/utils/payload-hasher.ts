import stringify from 'fast-json-stable-stringify';
import * as crypto from 'node:crypto';

export interface BusinessKeys {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: any;
  referenceExternalTransactionId?: string;
  [key: string]: any;
}

export class PayloadHasher {
  static generate(dto: BusinessKeys | Record<string, any>): string {
    const clonedDto = { ...dto };

    // Remove estritamente os metadados de transporte se existirem dentro do objeto
    delete clonedDto.idempotencyKey;
    delete clonedDto['idempotency-key'];
    delete clonedDto.inbox;

    if (clonedDto.money && typeof clonedDto.money.toJSON === 'function') {
      clonedDto.money = clonedDto.money.toJSON();
    }

    const hashString = stringify(clonedDto);
    return crypto.createHash('sha256').update(hashString).digest('hex');
  }
}

