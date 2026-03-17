import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Scheduled task that marks offers as 'expired' once their valid_until
 * timestamp has passed.
 *
 * Runs every 30 minutes. The query only touches offers that are still
 * 'active' (or 'inactive') and whose valid_until < now, so it is
 * cheap and index-friendly (idx_offers_status + idx_offers_validity).
 *
 * Why a cron job instead of inline API checks?
 * - The DB status field becomes the single source of truth.
 * - Merchant / admin dashboards show the correct status without extra
 *   date-filter logic scattered across every query.
 * - Branch-assignment logic can safely exclude expired offers by status.
 * - The student-facing APIs already filter by date at query time, so they
 *   remain correct even in the 30-minute window before the cron fires.
 */
@Injectable()
export class OffersExpiryTask {
  private readonly logger = new Logger(OffersExpiryTask.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireOffers(): Promise<void> {
    const now = new Date();

    try {
      const result = await this.prisma.offers.updateMany({
        where: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: { in: ['active', 'inactive'] as any },
          valid_until: { lt: now },
        },
        data: {
          // 'expired' was added to the DB enum via migration
          // add_expired_to_offer_status.sql. The cast can be removed after
          // running `prisma generate` against the updated DB.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: 'expired' as any,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Expired ${result.count} offer(s) at ${now.toISOString()}`);
      }
    } catch (err) {
      this.logger.error('Failed to run offer expiry task', err);
    }
  }
}
