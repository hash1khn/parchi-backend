import { Injectable } from '@nestjs/common';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Small in-memory sliding-window limiter.
 *
 * The global IP-based ThrottlerGuard is a poor fit for partner (server-to-server)
 * and per-student polling traffic: one IK server IP would share a single bucket
 * across every shopper, and students behind a campus NAT would share one too.
 * This limiter is keyed on an explicit identity (partner id / user id) instead.
 *
 * State is per process. That is acceptable for abuse protection; it is not an
 * exact global quota when running multiple instances.
 */
@Injectable()
export class RateLimiterService {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    const existing = this.hits.get(key);
    const recent = existing ? existing.filter((t) => t > cutoff) : [];

    if (recent.length >= limit) {
      this.hits.set(key, recent);
      const retryAfterMs = recent[0] + windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.sweep(now, windowMs);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < 60_000 && this.hits.size < 10_000) return;
    this.lastSweep = now;
    const cutoff = now - windowMs * 2;
    for (const [key, times] of this.hits) {
      if (times.length === 0 || times[times.length - 1] < cutoff) this.hits.delete(key);
    }
  }
}
