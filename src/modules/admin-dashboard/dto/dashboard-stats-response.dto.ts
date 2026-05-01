export interface PlatformOverview {
  totalActiveStudents: number;
  totalActiveStudentsGrowth: number; // % MoM
  totalVerifiedMerchants: number;
  totalVerifiedMerchantsGrowth: number; // % MoM
  totalRedemptions: number;
}

export interface UserManagement {
  verificationQueue: number; // pending student KYC
  suspendedRejected: number; // rejected + inactive users
}

export interface TopMerchant {
  id: string;
  businessName: string;
  redemptionCount: number;
  category: string | null;
  logoPath: string | null;
  branches: {
    id: string;
    branchName: string;
    redemptionCount: number;
  }[];
}

export interface UniversityStats {
  university: string;
  studentCount: number;
  percentage: number;
  redemptionCount: number;
  engagementScore: number;
}

export interface FunnelStat {
  step: string;
  count: number;
}

export interface PlatformStat {
  platform: string;
  count: number;
}

export interface KycRejectionStats {
  byReason: { reason: string; count: number }[];
  byUniversity: { university: string; rejectedCount: number }[];
  mostFoundIssue: string | null;
  totalRejected: number;
}

export interface ActiveUserTracking {
  last7Days: {
    uniqueStudents: number;
    totalRedemptions: number;
    dailyBreakdown: { date: string; count: number }[];
  };
  last30Days: {
    uniqueStudents: number;
    totalRedemptions: number;
    dailyBreakdown: { date: string; count: number }[];
  };
}

export interface AdminDashboardStatsResponse {
  platformOverview: PlatformOverview;
  userManagement: UserManagement;
  topPerformingMerchants: TopMerchant[];
  universityDistribution: UniversityStats[];
  leaderboardTopPerformers: number; // students with 10+ redemptions
  foundersClubMembers: number;
  funnelStats?: FunnelStat[];
  onboardingDropoff?: FunnelStat[];
  platformDistribution?: PlatformStat[];
  dailyPlatformDistribution?: { date: string; ios: number; android: number }[];
  kycPerformance?: {
    medianDaysToFirstRedemption: number;
  };
  kycRejectionStats?: KycRejectionStats;
  activeUserTracking?: ActiveUserTracking;
}

