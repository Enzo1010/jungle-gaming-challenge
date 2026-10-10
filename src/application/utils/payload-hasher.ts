import stringify from 'fast-json-stable-stringify';
import * as crypto from 'node:crypto';
import { Money } from '../../domain/value-objects/money.js';

export interface BusinessKeys {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: Money;
  referenceExternalTransactionId?: string;
}

export class PayloadHasher {
  static generate(payload: BusinessKeys): string {
    const data = {
      providerId: payload.providerId,
      externalTransactionId: payload.externalTransactionId,
      playerId: payload.playerId,
      walletId: payload.walletId,
      roundId: payload.roundId,
      gameId: payload.gameId,
      kind: payload.kind,
      money: payload.money.toJSON(),
      ...(payload.referenceExternalTransactionId ? { referenceExternalTransactionId: payload.referenceExternalTransactionId } : {}),
    };

    const hashString = stringify(data);
    return crypto.createHash('sha256').update(hashString).digest('hex');
  }
}
