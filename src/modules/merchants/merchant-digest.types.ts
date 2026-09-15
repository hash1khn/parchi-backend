export interface MerchantDigestSummary {
  totalRedemptions: number;
  uniqueStudents: number;
  bonusRedemptions: number;
  /** Sum of fixed-PKR offer+bonus amounts only (percentage rewards are not currency). */
  totalFixedDiscountPkr: number;
}

export interface MerchantDigestBranchRow {
  branchName: string;
  totalRedemptions: number;
}

export interface MerchantDigestOfferRow {
  offerTitle: string;
  totalRedemptions: number;
  discountType: string;
  discountValue: number;
  /** Display label e.g. "20%" or "PKR 100" */
  discountLabel: string;
}

export interface MerchantDigestRedemptionRow {
  id: string;
  date: Date;
  branchName: string;
  offerTitle: string;
  offerDiscountLabel: string;
  parchiId: string;
  university: string | null;
  isBonusApplied: boolean;
  bonusDiscountApplied: number;
  bonusDiscountType: string | null;
  /** Display label e.g. "40%", "PKR 40", "Free item", or "-" */
  bonusDiscountLabel: string;
}

export interface MerchantDigestPayload {
  merchantId: string;
  businessName: string;
  contactEmail: string;
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  summary: MerchantDigestSummary;
  branchBreakdown: MerchantDigestBranchRow[];
  topOffers: MerchantDigestOfferRow[];
  redemptions: MerchantDigestRedemptionRow[];
}

/** Format offer/bonus discount for PDF/email (WinAnsi-safe). */
export function formatDiscountLabel(
  type: string | null | undefined,
  value: number | null | undefined,
  options?: { additionalItem?: string | null },
): string {
  if (value == null || Number.isNaN(Number(value))) {
    if (type === 'item') {
      return options?.additionalItem
        ? `Free ${options.additionalItem}`
        : 'Free item';
    }
    return '-';
  }
  const n = Number(value);
  if (type === 'percentage') return `${n}%`;
  if (type === 'fixed') return `PKR ${n}`;
  if (type === 'item') {
    return options?.additionalItem
      ? `Free ${options.additionalItem}`
      : 'Free item';
  }
  // Unknown type: avoid assuming PKR
  return String(n);
}
