import { IsString, IsNotEmpty, IsEnum, IsIn, IsOptional, ValidateNested, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { EXTERNALLY_SUBMITTABLE_KINDS, WagerTransactionKind } from '../../../domain/entities/wager-transaction.js';
import { MONEY_AMOUNT_INPUT_PATTERN } from '../../../domain/value-objects/money.js';
import { unprocessable } from '../validation/validation-exception.factory.js';

export class MoneyDto {
  @IsString()
  @Matches(MONEY_AMOUNT_INPUT_PATTERN, {
    message: 'amount must be a non-negative decimal string with exactly 2 decimal places (e.g. "25.00")',
  })
  amount!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be an ISO-4217 code (e.g. "BRL")' })
  currency!: string;
}

export class SubmitWagerDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  // IsEnum → formato (400). IsIn → OPENING é um kind válido mas interno (422).
  @IsEnum(WagerTransactionKind)
  @IsIn(EXTERNALLY_SUBMITTABLE_KINDS, {
    message: 'kind OPENING is internal and cannot be submitted',
    context: unprocessable('FORBIDDEN_TRANSACTION_KIND'),
  })
  kind!: WagerTransactionKind;

  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @IsString()
  @IsOptional()
  referenceExternalTransactionId?: string;
}
