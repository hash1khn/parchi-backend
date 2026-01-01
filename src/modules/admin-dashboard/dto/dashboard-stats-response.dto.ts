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
}

export interface AdminDashboardStatsResponse {
  platformOverview: PlatformOverview;
  userManagement: UserManagement;
  topPerformingMerchants: TopMerchant[];
  universityDistribution: UniversityStats[];
  leaderboardTopPerformers: number; // students with 10+ redemptions
  foundersClubMembers: number;
}
