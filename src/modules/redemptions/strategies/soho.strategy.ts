import { Injectable } from '@nestjs/common';
import {
  IRedemptionStrategy,
  StrategyContext,
  StrategyResult,
} from './redemption-strategy.interface';

@Injectable()
export class SohoStrategy implements IRedemptionStrategy {
  async calculateDiscount(context: StrategyContext): Promise<StrategyResult> {
    const { studentId, merchantId, tx } = context;
    const now = new Date();

    // 1. Get recent redemptions to calculate streak dynamically
    // We fetch more than we likely need to be safe (e.g., last 20)
    const recentRedemptions = await tx.redemptions.findMany({
      where: {
        student_id: studentId,
        offers: {
          merchant_id: merchantId,
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 20,
      select: {
        created_at: true,
      },
    });

    // 2. Calculate Current Streak
    // Iterate backwards from NOW.
    // Gap > 10 days breaks the streak.

    let streak = 0;
    let lastDate = now;

    for (const redemption of recentRedemptions) {
      if (!redemption.created_at) continue;

      const redemptionDate = new Date(redemption.created_at);
      const diffTime = Math.abs(lastDate.getTime() - redemptionDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Note: diffDays calc might be slightly off depending on hours,
      // but strict 10 days (240 hours) concept is safer?
      // The prompt says "next 10 days".
      // Let's stick to the day difference logic.

      // Allow same day (0 days) or up to 10 days
      // We subtract a small buffer or just use simple Day diff?
      // "next 10 days" -> <= 10.

      if (diffDays <= 10) {
        streak++;
        lastDate = redemptionDate;
      } else {
        // Streak broken
        break;
      }
    }

    const visitCount = streak + 1; // +1 for the current visit being processed

    // Tier 1: 1st Visit (or Reset) - 20%
    if (visitCount === 1) {
      return {
        discountValue: 20,
        discountType: 'percentage',
        note: 'First Visit (or Streak Reset): 20% OFF',
      };
    }

    // Tier 2: 2nd Visit (Streak 2) - 30%
    if (visitCount === 2) {
      return {
        discountValue: 30,
        discountType: 'percentage',
        note: 'Loyalty Bonus: 30% OFF',
      };
    }

    // Tier 3: 3rd Visit+ (Streak 3+) - 40%
    if (visitCount >= 3) {
      return {
        discountValue: 40,
        discountType: 'percentage',
        note: 'Loyalty Streak: 40% OFF',
      };
    }

    // Fallback
    return {
      discountValue: 20,
      discountType: 'percentage',
      note: 'Standard: 20% OFF',
    };
  }
}
