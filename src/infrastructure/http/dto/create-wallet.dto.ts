import { IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyDto } from './submit-wager.dto.js';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  initialBalance!: MoneyDto;
}

export class ReconciliationDto {
  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @ValidateNested()
  @Type(() => MoneyDto)
  storedBalance!: MoneyDto;

  @ValidateNested()
  @Type(() => MoneyDto)
  calculatedBalance!: MoneyDto;

  @ValidateNested()
  @Type(() => MoneyDto)
  difference!: MoneyDto;
}
