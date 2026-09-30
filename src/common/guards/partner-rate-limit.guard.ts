import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from '../rate-limit/rate-limiter.service';

function intFromEnv(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Per-partner rate limit. Must run AFTER PartnerApiKeyGuard (needs request.partner).
 * Limits are per API key, not per source IP.
 *   PARTNER_CREATE_LIMIT_PER_MIN  (default 120)  POST
 *   PARTNER_STATUS_LIMIT_PER_MIN  (default 3000) GET (status polling)
 */
@Injectable()
export class PartnerRateLimitGuard implements CanActivate {
  private readonly createLimit: number;
  private readonly statusLimit: number;

  constructor(
    private readonly limiter: RateLimiterService,
    config: ConfigService,
  ) {
    this.createLimit = intFromEnv(config.get('PARTNER_CREATE_LIMIT_PER_MIN'), 120);
    this.statusLimit = intFromEnv(config.get('PARTNER_STATUS_LIMIT_PER_MIN'), 3000);
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const partnerId: string | undefined = request.partner?.id;
    if (!partnerId) return true; // key guard already rejected

    const isWrite = request.method !== 'GET';
    const result = this.limiter.consume(
      `partner:${partnerId}:${isWrite ? 'write' : 'read'}`,
      isWrite ? this.createLimit : this.statusLimit,
      60_000,
    );

    if (!result.allowed) {
      http.getResponse().setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        { statusCode: 429, message: 'Rate limit exceeded', error: 'Too Many Requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
