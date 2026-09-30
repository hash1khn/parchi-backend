import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';
import {
  hashedKeysEqual,
  hashPartnerKey,
  PLACEHOLDER_PARTNER_KEY_HASH,
} from '../../utils/partner-key.util';
import { RateLimiterService } from '../rate-limit/rate-limiter.service';

const CACHE_TTL_MS = 30_000;
/** Failed authentications allowed per source IP per minute before we start returning 429. */
const AUTH_FAILURES_PER_MIN = 20;

@Injectable()
export class PartnerApiKeyGuard implements CanActivate {
  private cache:
    | { loadedAt: number; keys: { id: string; partner_name: string; hashed_key: string }[] }
    | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const rawKey = this.extractKey(request);

    if (!rawKey) {
      this.recordFailure(http, request);
      throw new UnauthorizedException('Missing partner API key');
    }

    const presentedHash = hashPartnerKey(rawKey);

    // Defense in depth: the public placeholder key is never acceptable.
    const keys = await this.getActiveKeys();
    const match =
      presentedHash === PLACEHOLDER_PARTNER_KEY_HASH
        ? undefined
        : keys.find((key) => hashedKeysEqual(key.hashed_key, presentedHash));

    if (!match) {
      this.recordFailure(http, request);
      throw new UnauthorizedException('Invalid partner API key');
    }

    request.partner = {
      id: match.id,
      partnerName: match.partner_name,
    };
    return true;
  }

  /** Counts a failed attempt against the caller's IP and throws 429 once it is excessive. */
  private recordFailure(http: ReturnType<ExecutionContext['switchToHttp']>, request: any) {
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const result = this.limiter.consume(`partner-auth-fail:${ip}`, AUTH_FAILURES_PER_MIN, 60_000);
    if (!result.allowed) {
      http.getResponse().setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        { statusCode: 429, message: 'Too many failed attempts', error: 'Too Many Requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private extractKey(request: any): string | null {
    const header = request.headers?.['x-partner-key'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    if (Array.isArray(header) && typeof header[0] === 'string' && header[0].trim()) {
      return header[0].trim();
    }
    return null;
  }

  private async getActiveKeys() {
    const now = Date.now();
    if (this.cache && now - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.keys;
    }

    const keys = await this.prisma.partner_api_keys.findMany({
      where: { is_active: true },
      select: { id: true, partner_name: true, hashed_key: true },
    });
    this.cache = { loadedAt: now, keys };
    return keys;
  }
}
