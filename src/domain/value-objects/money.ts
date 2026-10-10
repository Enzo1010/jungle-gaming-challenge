import { Decimal } from 'decimal.js';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/domain.error.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

/**
 * Contrato de entrada: string decimal NÃO negativa, escala fixa 2, sem sinal,
 * sem notação científica, sem zeros à esquerda e cabendo em DECIMAL(19,2)
 * (máx. 17 dígitos inteiros).
 */
export const MONEY_AMOUNT_INPUT_PATTERN = /^(0|[1-9]\d{0,16})\.\d{2}$/;
/** ISO-4217: três letras. */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  public readonly amount!: string;
  public readonly currency!: string;

  private constructor(amount: string, currency: string) {
    this.amount = amount;
    this.currency = currency;
  }

  /**
   * Fronteira de entrada (HTTP, SQS, persistência de valores de entrada).
   * Rejeita negativos — a única forma de obter um Money negativo é através da
   * aritmética interna (`subtract`/`negate`), nunca por um contrato externo.
   * Zero é aceite (ex.: wallet aberta com 0.00); para montantes de operação
   * use `Money.positive`.
   */
  static from(props: MoneyProps): Money {
    if (!props || typeof props.amount !== 'string' || props.amount.length === 0) {
      throw new InvalidMoneyAmountError('Amount must be a non-empty string');
    }

    if (!MONEY_AMOUNT_INPUT_PATTERN.test(props.amount)) {
      throw new InvalidMoneyAmountError(
        'Amount must be a non-negative decimal string with exactly 2 decimal places (e.g. "25.00"), without sign, leading zeros or scientific notation, and at most 17 integer digits',
      );
    }

    const currency = Money.normalizeCurrency(props.currency);
    const value = new Decimal(props.amount);
    return new Money(value.toFixed(2), currency);
  }

  /** Igual a `from`, mas exige montante estritamente positivo (> 0). */
  static positive(props: MoneyProps): Money {
    const money = Money.from(props);
    if (!money.isPositive()) {
      throw new InvalidMoneyAmountError('Amount must be greater than zero');
    }
    return money;
  }

  static zero(currency: string): Money {
    return new Money('0.00', Money.normalizeCurrency(currency));
  }

  private static normalizeCurrency(currency: unknown): string {
    if (typeof currency !== 'string') {
      throw new InvalidMoneyAmountError('Currency must be an ISO-4217 code (e.g. "BRL")');
    }
    const normalized = currency.toUpperCase();
    if (!CURRENCY_PATTERN.test(normalized)) {
      throw new InvalidMoneyAmountError('Currency must be an ISO-4217 code (e.g. "BRL")');
    }
    return normalized;
  }

  get value(): Decimal {
    return new Decimal(this.amount);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value).toFixed(2), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value).toFixed(2), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated().toFixed(2), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) {
      return false;
    }
    return this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}
