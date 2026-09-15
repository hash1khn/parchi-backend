import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as UpstashRedis } from '@upstash/redis';
import Redis from 'ioredis';

/**
 * Redis wrapper supporting:
 * 1) Upstash REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) via @upstash/redis
 * 2) Classic Redis URL (`REDIS_URL` / rediss://) via ioredis — matches Upstash TCP endpoint
 *
 * Disabled (cache no-ops; cron lock allows local single-instance) when neither is configured.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private upstash: UpstashRedis | null = null;
  private ioredis: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const restUrl = this.configService.get<string>('UPSTASH_REDIS_REST_URL');
    const restToken = this.configService.get<string>('UPSTASH_REDIS_REST_TOKEN');
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (restUrl && restToken) {
      this.upstash = new UpstashRedis({ url: restUrl, token: restToken });
      this.logger.log('Upstash Redis REST client initialized');
      return;
    }

    if (redisUrl) {
      this.ioredis = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      this.ioredis.on('error', (err) => {
        this.logger.warn(`ioredis error: ${err.message}`);
      });
      this.logger.log('Redis client initialized from REDIS_URL');
      return;
    }

    this.logger.warn(
      'Redis not configured (set REDIS_URL or UPSTASH_REDIS_REST_URL/TOKEN) — cache & locks degraded',
    );
  }

  async onModuleDestroy() {
    if (this.ioredis) {
      await this.ioredis.quit().catch(() => undefined);
    }
  }

  get enabled(): boolean {
    return this.upstash !== null || this.ioredis !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.upstash) {
        return (await this.upstash.get<T>(key)) ?? null;
      }
      if (this.ioredis) {
        const raw = await this.ioredis.get(key);
        if (raw == null) return null;
        return JSON.parse(raw) as T;
      }
    } catch (err) {
      this.logger.warn(
        `Redis GET ${key} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    return null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      if (this.upstash) {
        if (ttlSeconds != null && ttlSeconds > 0) {
          await this.upstash.set(key, value, { ex: ttlSeconds });
        } else {
          await this.upstash.set(key, value);
        }
        return;
      }
      if (this.ioredis) {
        const payload = JSON.stringify(value);
        if (ttlSeconds != null && ttlSeconds > 0) {
          await this.ioredis.set(key, payload, 'EX', ttlSeconds);
        } else {
          await this.ioredis.set(key, payload);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Redis SET ${key} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      if (this.upstash) {
        await this.upstash.del(...keys);
        return;
      }
      if (this.ioredis) {
        await this.ioredis.del(...keys);
      }
    } catch (err) {
      this.logger.warn(
        `Redis DEL failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async delByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    try {
      if (this.upstash) {
        let cursor: string | number = 0;
        do {
          const [next, keys] = await this.upstash.scan(cursor, {
            match: `${prefix}*`,
            count: 100,
          });
          cursor = next;
          if (keys.length > 0) {
            await this.upstash.del(...keys);
            deleted += keys.length;
          }
        } while (cursor !== 0 && cursor !== '0');
        return deleted;
      }
      if (this.ioredis) {
        let cursor = '0';
        do {
          const [next, keys] = await this.ioredis.scan(
            cursor,
            'MATCH',
            `${prefix}*`,
            'COUNT',
            100,
          );
          cursor = next;
          if (keys.length > 0) {
            await this.ioredis.del(...keys);
            deleted += keys.length;
          }
        } while (cursor !== '0');
      }
    } catch (err) {
      this.logger.warn(
        `Redis delByPrefix(${prefix}) failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    return deleted;
  }

  /**
   * Acquire a distributed lock: SET key value NX EX ttl.
   * Returns true if this process owns the lock.
   */
  async acquireLock(
    key: string,
    ttlSeconds: number,
    token = `pid=${process.pid}`,
  ): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn(`Redis lock skipped (no client) for ${key}`);
      return true;
    }
    try {
      if (this.upstash) {
        const result = await this.upstash.set(key, token, {
          nx: true,
          ex: ttlSeconds,
        });
        return result === 'OK';
      }
      if (this.ioredis) {
        const result = await this.ioredis.set(
          key,
          token,
          'EX',
          ttlSeconds,
          'NX',
        );
        return result === 'OK';
      }
    } catch (err) {
      this.logger.error(
        `Redis acquireLock ${key} failed: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
    return false;
  }

  async releaseLock(key: string, token?: string): Promise<void> {
    if (!this.enabled) return;
    try {
      if (token) {
        const current =
          this.upstash != null
            ? await this.upstash.get<string>(key)
            : await this.ioredis!.get(key);
        if (current !== token) return;
      }
      await this.del(key);
    } catch (err) {
      this.logger.warn(
        `Redis releaseLock ${key} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
