// ── Brand Portfolio Health ──────────────────────────────────────────────────

export interface BrandWeeklyTrend {
  weekStart: string; // "YYYY-MM-DD"
  redemptionCount: number;
}

export interface BrandTrendStat {
  merchantId: string;
  businessName: string;
  logoPath: string | null;
  category: string | null;
  weeklyTrend: BrandWeeklyTrend[]; // up to 4 entries
  totalLast4Weeks: number;
  trendDirection: 'up' | 'down' | 'flat'; // comparing last 2 weeks
}

export interface BrandReachStat {
  merchantId: string;
  businessName: string;
  logoPath: string | null;
  category: string | null;
  uniqueRedeemers: number;
  totalRedemptions: number;
}

export interface BrandConcentrationEntry {
  merchantId: string;
  businessName: string;
  redemptionCount: number;
  sharePct: number;
}

export interface BrandConcentration {
  totalRedemptions: number;
  top3SharePct: number;
  top5SharePct: number;
  /** Herfindahl-Hirschman Index (0–10 000); higher = more concentrated */
  hhi: number;
  brands: BrandConcentrationEntry[];
}

export interface DryPartnerFlag {
  merchantId: string;
  businessName: string;
  logoPath: string | null;
  category: string | null;
  redemptionsLast7Days: number;
  redemptionsLast30Days: number;
  lastRedemptionAt: string | null; // ISO date string
  severity: 'zero' | 'low'; // zero = 0 in 30 days, low = <3 in 7 days
}

export interface BrandPortfolioHealthResponse {
  brandTrends: BrandTrendStat[];
  brandReach: BrandReachStat[];
  concentration: BrandConcentration;
  dryPartners: DryPartnerFlag[];
}

// ── Competitor Benchmarks ───────────────────────────────────────────────────

export interface CompetitorBenchmarkEntry {
  id: string;
  competitorName: string;
  metricName: string;
  metricValue: number;
  recordedAt: string;
  notes: string | null;
  sourceUrl: string | null;
}

export interface UpsertCompetitorBenchmarkDto {
  competitorName: string;
  metricName: string;
  metricValue: number;
  recordedAt?: string;
  notes?: string;
  sourceUrl?: string;
}

export interface CompetitorComparisonMetric {
  metricName: string;
  parchiValue: number;
  competitors: { name: string; value: number; delta: number; deltaDirection: 'ahead' | 'behind' | 'tied' }[];
}

export interface CompetitorBenchmarksResponse {
  entries: CompetitorBenchmarkEntry[];
  comparison: CompetitorComparisonMetric[];
}
