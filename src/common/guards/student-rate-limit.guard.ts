import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RateLimiterService } from '../rate-limit/rate-limiter.service';

/**
 * Per-user rate limit for student verification endpoints. Must run AFTER JwtAuthGuard.
 * Keyed on user id so students sharing a campus NAT do not share a bucket.
 * The Flutter app polls every ~5s (12/min) so 120/min reads leaves plenty of headroom.
 */
@Injectable()
export class StudentRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimiterService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const userId: string | undefined = request.user?.id;
    if (!userId) return true;

    const isWrite = request.method !== 'GET';
    const result = this.limiter.consume(
      `student-verify:${userId}:${isWrite ? 'write' : 'read'}`,
      isWrite ? 30 : 120,
      60_000,
    );

    if (!result.allowed) {
      http.getResponse().setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        { statusCode: 429, message: 'Too many requests, slow down', error: 'Too Many Requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
