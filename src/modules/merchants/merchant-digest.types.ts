export interface MerchantDigestSummary {
  totalRedemptions: number;
  uniqueStudents: number;
  totalDiscountGiven: number;
  avgDiscountPerOrder: number;
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
}

export interface MerchantDigestRedemptionRow {
  id: string;
  date: Date;
  branchName: string;
  offerTitle: string;
  parchiId: string;
  university: string | null;
  bonusDiscountApplied: number;
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
