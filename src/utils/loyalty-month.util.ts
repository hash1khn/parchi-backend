import { Prisma } from '@prisma/client';
import { startOfPakistanMonth } from './pakistan-time.util';

type RedemptionsCounter = {
  redemptions: {
    count: (args: { where: Prisma.redemptionsWhereInput }) => Promise<number>;
  };
};

/**
 * Count a student's loyalty-eligible visits in the current Pakistan calendar month.
 * Offer-scoped programs count that offer only; merchant-wide counts any branch of the merchant.
 * Prior months are excluded so unused visits do not carry over.
 */
export async function countLoyaltyVisitsThisMonth(
  db: RedemptionsCounter,
  params: {
    studentId: string;
    merchantId?: string;
    offerId?: string;
    now?: Date;
  },
): Promise<number> {
  const monthStart = startOfPakistanMonth(params.now ?? new Date());

  if (params.offerId) {
    return db.redemptions.count({
      where: {
        student_id: params.studentId,
        offer_id: params.offerId,
        created_at: { gte: monthStart },
      },
    });
  }

  if (!params.merchantId) {
    return 0;
  }

  return db.redemptions.count({
    where: {
      student_id: params.studentId,
      merchant_branches: { merchant_id: params.merchantId },
      created_at: { gte: monthStart },
    },
  });
}

/** True when this visit (already included in the count) unlocks the monthly bonus. */
export function isLoyaltyBonusVisit(
  visitsThisMonthIncludingCurrent: number,
  redemptionsRequired: number,
): boolean {
  const req = redemptionsRequired > 0 ? redemptionsRequired : 5;
  return (
    visitsThisMonthIncludingCurrent > 0 &&
    visitsThisMonthIncludingCurrent % req === 0
  );
}

/** Punch-card display: 5th visit this month shows 5/5, 6th shows 1/5. */
export function monthlyPunchCardCurrent(
  visitsThisMonth: number,
  redemptionsRequired: number,
): number {
  const req = redemptionsRequired > 0 ? redemptionsRequired : 5;
  if (visitsThisMonth <= 0) {
    return 0;
  }
  const remainder = visitsThisMonth % req;
  return remainder === 0 ? req : remainder;
}
