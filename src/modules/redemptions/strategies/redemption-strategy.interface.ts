export interface StrategyContext {
  studentId: string;
  merchantId: string;
  offerId: string;
  tx: any; // Prisma Transaction Client
}

export interface StrategyResult {
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  note?: string;
  metadata?: any;
}

export interface IRedemptionStrategy {
  calculateDiscount(context: StrategyContext): Promise<StrategyResult>;
}
