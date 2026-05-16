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

export interface RedemptionAnalyticsResponse {
  uniqueRedeemers: number;
  totalRegisteredStudents: number;
  volumeTrends: RedemptionVolumeBreakdown;
  behaviorHistogram: UserBehaviorBucket[];
  repeatRates: RepeatRateStat[];
  fifthBonusStats: FifthBonusStats;
}
