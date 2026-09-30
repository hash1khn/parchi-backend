import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePartnerDiscountRedemptionDto } from './create-partner-discount-redemption.dto';

const valid = {
  verificationRequestId: 'c0a8012e-7b3a-4c11-9f0d-1b2c3d4e5f60',
  externalReference: 'ik_order_98123',
  parchiId: '48219',
  discountAmountPkr: 1000,
  orderTotalPkr: 4500,
};

async function errorsFor(over: Record<string, unknown>) {
  const dto = plainToInstance(CreatePartnerDiscountRedemptionDto, { ...valid, ...over });
  return validate(dto);
}

describe('CreatePartnerDiscountRedemptionDto', () => {
  it('accepts a valid payload', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each([
    ['negative', { discountAmountPkr: -1 }],
    ['more than 2 decimal places', { discountAmountPkr: 1.001 }],
    ['NaN', { discountAmountPkr: Number.NaN }],
    ['Infinity', { discountAmountPkr: Number.POSITIVE_INFINITY }],
    ['above DECIMAL(12,2)', { discountAmountPkr: 10_000_000_000 }],
    ['string', { discountAmountPkr: '1000' as unknown as number }],
  ])('rejects discountAmountPkr that is %s', async (_label, over) => {
    expect(await errorsFor(over)).not.toHaveLength(0);
  });

  it.each([
    ['negative', { orderTotalPkr: -0.01 }],
    ['more than 2 decimal places', { orderTotalPkr: 10.999 }],
    ['above DECIMAL(12,2)', { orderTotalPkr: 10_000_000_000 }],
  ])('rejects orderTotalPkr that is %s', async (_label, over) => {
    expect(await errorsFor(over)).not.toHaveLength(0);
  });
});
