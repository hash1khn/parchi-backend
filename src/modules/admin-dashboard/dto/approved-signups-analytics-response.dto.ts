export interface SignupVolumeDataPoint {
  date: string;
  count: number;
}

export interface ApprovedSignupsVolumeBreakdown {
  daily: SignupVolumeDataPoint[]; // last 30 days (or full custom range)
  weekly: SignupVolumeDataPoint[]; // last 12 weeks (or full custom range)
  monthly: SignupVolumeDataPoint[]; // last 12 months (or full custom range)
  yearly: SignupVolumeDataPoint[]; // last 5 years (or full custom range)
}

export interface ApprovedSignupsAnalyticsResponse {
  /** Approved students whose verified_at falls in the selected window (all-time when no range). */
  totalApproved: number;
  /** Approved students verified in the current calendar month. */
  thisMonth: number;
  /** Approved students verified in the previous calendar month. */
  lastMonth: number;
  /** MoM change % (1 decimal). 0 when lastMonth is 0. */
  changePercent: number;
  volumeTrends: ApprovedSignupsVolumeBreakdown;
}
