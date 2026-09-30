import { HttpException, UnauthorizedException } from '@nestjs/common';
import { PartnerApiKeyGuard } from './partner-api-key.guard';
import { hashPartnerKey, PLACEHOLDER_PARTNER_KEY_HASH } from '../../utils/partner-key.util';
import { RateLimiterService } from '../rate-limit/rate-limiter.service';

function ctx(headers: Record<string, any>, ip = '1.2.3.4') {
  const request: any = { headers, ip };
  const response = { setHeader: jest.fn() };
  return {
    request,
    response,
    context: {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as any,
  };
}

describe('PartnerApiKeyGuard', () => {
  const goodKey = 'g'.repeat(40);
  let prisma: { partner_api_keys: { findMany: jest.Mock } };
  let guard: PartnerApiKeyGuard;

  beforeEach(() => {
    prisma = {
      partner_api_keys: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', partner_name: 'inside_karachi', hashed_key: hashPartnerKey(goodKey) },
        ]),
      },
    };
    guard = new PartnerApiKeyGuard(prisma as any, new RateLimiterService());
  });

  it('accepts a valid key and attaches the partner', async () => {
    const { context, request } = ctx({ 'x-partner-key': goodKey });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.partner).toEqual({ id: 'p1', partnerName: 'inside_karachi' });
  });

  it('rejects missing and wrong keys with 401', async () => {
    await expect(guard.canActivate(ctx({}).context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(ctx({ 'x-partner-key': 'nope' }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('never accepts the public placeholder key even if a row exists for it', async () => {
    prisma.partner_api_keys.findMany.mockResolvedValue([
      { id: 'p1', partner_name: 'inside_karachi', hashed_key: PLACEHOLDER_PARTNER_KEY_HASH },
    ]);
    await expect(
      guard.canActivate(
        ctx({ 'x-partner-key': 'REPLACE_ME_SET_INSIDE_KARACHI_PARTNER_KEY' }).context,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('only consults active keys', async () => {
    await guard.canActivate(ctx({ 'x-partner-key': goodKey }).context);
    expect(prisma.partner_api_keys.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true } }),
    );
  });

  it('starts returning 429 after repeated failures from one IP', async () => {
    let last: any;
    for (let i = 0; i < 25; i++) {
      try {
        await guard.canActivate(ctx({ 'x-partner-key': 'bad' }, '9.9.9.9').context);
      } catch (e) {
        last = e;
      }
    }
    expect(last).toBeInstanceOf(HttpException);
    expect((last as HttpException).getStatus()).toBe(429);
  });
});
