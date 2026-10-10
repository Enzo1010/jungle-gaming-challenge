import { EntitySchema } from '@mikro-orm/core';
import { Money } from '../../../domain/value-objects/money.js';

export const MoneySchema = new EntitySchema<any>({
  class: Money as any,
  embeddable: true,
  properties: {
    amount: { type: 'string', columnType: 'decimal(19,2)' },
    currency: { type: 'string' },
  },
});
