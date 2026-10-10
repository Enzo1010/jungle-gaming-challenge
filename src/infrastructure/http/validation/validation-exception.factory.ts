import { BadRequestException, HttpException, HttpStatus, UnprocessableEntityException, ValidationError } from '@nestjs/common';

/**
 * Contexto anexado a um constraint do class-validator para sinalizar que a
 * violação é semântica (422) e não de formato (400).
 *
 *   @IsIn([...], { context: unprocessable('FORBIDDEN_TRANSACTION_KIND') })
 */
export interface ValidationHttpContext {
  httpStatus: HttpStatus.UNPROCESSABLE_ENTITY;
  failureCode: string;
}

export const unprocessable = (failureCode: string): ValidationHttpContext => ({
  httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
  failureCode,
});

interface Violation {
  message: string;
  context?: Partial<ValidationHttpContext>;
}

function flatten(errors: ValidationError[], parentPath = ''): Violation[] {
  const violations: Violation[] = [];
  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      violations.push({ message: `${path}: ${message}`, context: error.contexts?.[constraint] });
    }
    if (error.children?.length) {
      violations.push(...flatten(error.children, path));
    }
  }
  return violations;
}

/**
 * Formato inválido → 400 INVALID_PAYLOAD.
 * Só devolve 422 quando TODAS as violações são semânticas (ex.: kind OPENING
 * bem formado mas proibido). Qualquer erro de formato tem precedência.
 */
export function validationExceptionFactory(errors: ValidationError[]): HttpException {
  const violations = flatten(errors);
  const messages = violations.map((v) => v.message);

  const unprocessableOnly =
    violations.length > 0 &&
    violations.every((v) => v.context?.httpStatus === HttpStatus.UNPROCESSABLE_ENTITY);

  if (unprocessableOnly) {
    return new UnprocessableEntityException({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      failureCode: violations[0].context?.failureCode ?? 'UNPROCESSABLE_ENTITY',
      message: messages,
    });
  }

  return new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    failureCode: 'INVALID_PAYLOAD',
    message: messages,
  });
}
