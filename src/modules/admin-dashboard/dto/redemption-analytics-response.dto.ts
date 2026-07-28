export interface VolumeDataPoint {
  date: string;
  count: number;
}

export interface RedemptionVolumeBreakdown {
  daily: VolumeDataPoint[];   // last 30 days
  weekly: VolumeDataPoint[];  // last 12 weeks
  monthly: VolumeDataPoint[]; // last 12 months
}

export interface UserBehaviorBucket {
  bucket: string;
  userCount: number;
}

export interface RepeatRateStat {
  windowDays: number;
  repeatCount: number;
  totalRedeemers: number;
  repeatRate: number; // percentage with 1 decimal
}

export interface FifthBonusStats {
  totalBonusTriggers: number;
  uniqueStudentsTriggered: number;
  usersReturnedAfterBonus: number;
  conversionRate: number; // percentage with 1 decimal
}

export interface MomUniqueRedeemers {
  thisMonth: number;
  lastMonth: number;
  /** MoM change % (1 decimal). 0 when lastMonth is 0. */
  changePercent: number;
}

export interface RedemptionAnalyticsResponse {
  uniqueRedeemers: number;
  totalRegisteredStudents: number;
  /** Distinct verified redeemers this calendar month vs last month. */
  momUniqueRedeemers: MomUniqueRedeemers;
  /** % of approved+active students who redeemed at least once this calendar month. */
  activeRedeemingPercent: number;
  volumeTrends: RedemptionVolumeBreakdown;
  behaviorHistogram: UserBehaviorBucket[];
  repeatRates: RepeatRateStat[];
  fifthBonusStats: FifthBonusStats;
}
