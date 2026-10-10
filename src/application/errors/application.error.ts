export class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class IdempotencyConflictError extends ApplicationError {
  constructor(key: string) {
    super(`Idempotency conflict for key: ${key}. The payload hash does not match the previously processed transaction.`);
  }
}

export class ConcurrencyConflictError extends ApplicationError {
  constructor(walletId: string) {
    super(`Concurrency conflict while processing transaction for wallet: ${walletId}. Maximum retries exceeded.`);
  }
}

export class WalletNotFoundError extends ApplicationError {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`);
  }
}

/**
 * O par (consumerName, messageId) já foi consumido, mas não existe transação
 * com a idempotency key desta mensagem — o messageId foi reutilizado para outra
 * operação. Terminal: não reprocessar.
 */
export class InboxMessageConflictError extends ApplicationError {
  constructor(consumerName: string, messageId: string) {
    super(`Message ${messageId} was already consumed by ${consumerName} for a different operation`);
  }
}
