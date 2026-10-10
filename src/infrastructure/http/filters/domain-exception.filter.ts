import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  DomainError,
  CurrencyMismatchError,
  ForbiddenTransactionKindError,
  InsufficientFundsError,
  InvalidMoneyAmountError,
  InvalidTransactionStateError,
  MissingReferenceError,
} from '../../../domain/errors/domain.error.js';
import { ApplicationError, IdempotencyConflictError, ConcurrencyConflictError, WalletNotFoundError } from '../../../application/errors/application.error.js';

@Catch(DomainError, ApplicationError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError | ApplicationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let failureCode = 'INTERNAL_ERROR';

    if (exception instanceof InvalidMoneyAmountError) {
      // Payload mal formado (montante/moeda) — o provedor tem de corrigir, não reenviar.
      status = HttpStatus.BAD_REQUEST;
      failureCode = 'INVALID_AMOUNT';
    } else if (exception instanceof ForbiddenTransactionKindError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      failureCode = 'FORBIDDEN_TRANSACTION_KIND';
    } else if (exception instanceof IdempotencyConflictError) {
      status = HttpStatus.CONFLICT;
      failureCode = 'IDEMPOTENCY_CONFLICT';
    } else if (exception instanceof ConcurrencyConflictError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      failureCode = 'CONCURRENCY_CONFLICT';
    } else if (exception instanceof WalletNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      failureCode = 'WALLET_NOT_FOUND';
    } else if (
      exception instanceof CurrencyMismatchError ||
      exception instanceof InsufficientFundsError ||
      exception instanceof InvalidTransactionStateError ||
      exception instanceof MissingReferenceError
    ) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      if (exception instanceof CurrencyMismatchError) failureCode = 'CURRENCY_MISMATCH';
      if (exception instanceof InsufficientFundsError) failureCode = 'INSUFFICIENT_FUNDS';
      if (exception instanceof InvalidTransactionStateError) failureCode = 'INVALID_TRANSACTION_STATE';
      if (exception instanceof MissingReferenceError) failureCode = 'MISSING_REFERENCE';
    }

    response.status(status).json({
      statusCode: status,
      failureCode,
      message: exception.message,
    });
  }
}
