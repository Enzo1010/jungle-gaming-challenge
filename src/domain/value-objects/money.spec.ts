import { describe, it, expect } from 'vitest';
import { Money } from './money.js';
import { CurrencyMismatchError, InvalidMoneyAmountError } from '../errors/domain.error.js';

describe('Money', () => {
  describe('from', () => {
    it('creates a Money instance with valid props', () => {
      const money = Money.from({ amount: '25.00', currency: 'BRL' });
      expect(money.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    });

    it('rejects negative amounts', () => {
      expect(() => Money.from({ amount: '-25.00', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
    });

    it('rejects amounts without exactly 2 decimal places', () => {
      expect(() => Money.from({ amount: '25', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
      expect(() => Money.from({ amount: '25.0', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
      expect(() => Money.from({ amount: '25.000', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
    });

    it('rejects empty strings, NaN, Infinity, scientific notation', () => {
      expect(() => Money.from({ amount: '', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
      expect(() => Money.from({ amount: 'NaN', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
      expect(() => Money.from({ amount: 'Infinity', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
      expect(() => Money.from({ amount: '1e2', currency: 'BRL' })).toThrow(InvalidMoneyAmountError);
    });
  });

  describe('operations', () => {
    it('adds two Money instances', () => {
      const m1 = Money.from({ amount: '10.50', currency: 'BRL' });
      const m2 = Money.from({ amount: '15.25', currency: 'BRL' });
      const sum = m1.add(m2);
      expect(sum.toJSON()).toEqual({ amount: '25.75', currency: 'BRL' });
      expect(m1.toJSON()).toEqual({ amount: '10.50', currency: 'BRL' }); // Immutability
    });

    it('subtracts two Money instances', () => {
      const m1 = Money.from({ amount: '20.00', currency: 'BRL' });
      const m2 = Money.from({ amount: '15.50', currency: 'BRL' });
      const diff = m1.subtract(m2);
      expect(diff.toJSON()).toEqual({ amount: '4.50', currency: 'BRL' }); // Wait, `toFixed(2)` should be '4.50'
    });

    it('throws error when operating on different currencies', () => {
      const m1 = Money.from({ amount: '10.00', currency: 'BRL' });
      const m2 = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => m1.add(m2)).toThrow(CurrencyMismatchError);
      expect(() => m1.subtract(m2)).toThrow(CurrencyMismatchError);
    });
  });
});
