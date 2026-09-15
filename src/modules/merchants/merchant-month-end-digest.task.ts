import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MerchantDigestService } from './merchant-digest.service';

/**
 * Sends month-end stats digests to active approved merchants
 * on the 1st of each month at 09:00 Pakistan time.
 *
 * Multi-replica safe: Upstash Redis SET NX lock (only one Railway replica runs).
 *
 * Gated by MERCHANT_DIGEST_CRON_ENABLED=true (off by default in dev).
 * Optional MERCHANT_DIGEST_DRY_RUN=true logs without sending.
 */
@Injectable()
export class MerchantMonthEndDigestTask {
  private readonly logger = new Logger(MerchantMonthEndDigestTask.name);

  constructor(
    private readonly digestService: MerchantDigestService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 9 1 * *', { timeZone: 'Asia/Karachi' })
  async handleCron(): Promise<void> {
    const enabled =
      this.configService.get<string>('MERCHANT_DIGEST_CRON_ENABLED') ===
      'true';

    if (!enabled) {
      this.logger.debug(
        'Merchant digest cron skipped (MERCHANT_DIGEST_CRON_ENABLED != true)',
      );
      return;
    }

    this.logger.log('Starting merchant month-end digest cron...');
    try {
      const { year, month, results, skippedAsFollower } =
        await this.digestService.runForPeriod({ useDistributedLock: true });

      if (skippedAsFollower) {
        this.logger.log(
          `Month-end digest ${year}-${month}: this replica is follower - no work`,
        );
        return;
      }

      const sent = results.filter((r) => r.status === 'sent').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const dryRun = results.filter((r) => r.status === 'dry_run').length;
      this.logger.log(
        `Month-end digest ${year}-${month} done: sent=${sent} failed=${failed} skipped=${skipped} dry_run=${dryRun}`,
      );
    } catch (err) {
      this.logger.error('Merchant month-end digest cron failed', err);
    }
  }
}
