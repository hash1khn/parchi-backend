import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  afterEach(() => jest.useRealTimers());

  it('allows up to the limit then blocks with a retry-after', () => {
    const limiter = new RateLimiterService();
    for (let i = 0; i < 3; i++) expect(limiter.consume('k', 3, 60_000).allowed).toBe(true);
    const blocked = limiter.consume('k', 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('isolates keys', () => {
    const limiter = new RateLimiterService();
    limiter.consume('a', 1, 60_000);
    expect(limiter.consume('a', 1, 60_000).allowed).toBe(false);
    expect(limiter.consume('b', 1, 60_000).allowed).toBe(true);
  });

  it('frees capacity after the window passes', () => {
    jest.useFakeTimers();
    const limiter = new RateLimiterService();
    limiter.consume('k', 1, 1000);
    expect(limiter.consume('k', 1, 1000).allowed).toBe(false);
    jest.advanceTimersByTime(1001);
    expect(limiter.consume('k', 1, 1000).allowed).toBe(true);
  });
});
