export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(expected: string, received: string) {
    super(`Currency mismatch: expected ${expected}, got ${received}`);
  }
}

export class InvalidCurrencyError extends CurrencyMismatchError {} // Keeping for backwards compatibility if needed, though we can just update money.ts

export class InvalidMoneyAmountError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidLedgerMathError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InsufficientFundsError extends DomainError {
  constructor(walletId: string, currentBalance: string, requestedAmount: string) {
    super(`Insufficient funds in wallet ${walletId}: current balance is ${currentBalance}, requested ${requestedAmount}`);
  }
}

export class InvalidTransactionStateError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class MissingReferenceError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Tipo de transação interno (ex.: OPENING) ou desconhecido submetido por um canal externo (HTTP/SQS). */
export class ForbiddenTransactionKindError extends DomainError {
  constructor(kind: string) {
    super(`Transaction kind ${kind} cannot be submitted externally`);
  }
}

export class ReversalValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class ReversalNegativeBalanceError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
