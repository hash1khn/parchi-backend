import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardStatsResponse } from './dto/dashboard-stats-response.dto';
import { RedemptionAnalyticsResponse } from './dto/redemption-analytics-response.dto';
import {
    BrandPortfolioHealthResponse,
    CompetitorBenchmarksResponse,
    UpsertCompetitorBenchmarkDto,
} from './dto/brand-portfolio-response.dto';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class AdminDashboardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly analyticsService: AnalyticsService,
    ) { }


    async getDashboardStats(startDate?: Date, endDate?: Date): Promise<AdminDashboardStatsResponse> {
        try {
            console.log('Fetching dashboard stats...', { startDate, endDate });
            
            // Run all queries in parallel for performance
            const [
                platformOverview,
                userManagement,
                topMerchants,
                universityDist,
                leaderboard,
                foundersClub,
                funnelStats,
                onboardingDropoff,
                platformDistribution,
                dailyPlatformDistribution,
                kycPerformance,
            ] = await Promise.all([
                this.getPlatformOverview(startDate, endDate).catch(e => { console.error('PlatformOverview Error:', e); throw e; }),
                this.getUserManagement().catch(e => { console.error('UserManagement Error:', e); throw e; }),
                this.getTopMerchants(startDate, endDate).catch(e => { console.error('TopMerchants Error:', e); throw e; }),
                this.getUniversityDistribution().catch(e => { console.error('UniversityDist Error:', e); throw e; }),
                this.getLeaderboardCount().catch(e => { console.error('Leaderboard Error:', e); throw e; }),
                this.getFoundersClubCount().catch(e => { console.error('FoundersClub Error:', e); throw e; }),
                this.analyticsService.getFunnelStats(startDate, endDate).catch(e => {
                    console.error('Analytics Error (Funnel):', e);
                    return [];
                }),
                this.analyticsService.getOnboardingDropoff(startDate, endDate).catch(e => {
                    console.error('Analytics Error (Dropoff):', e);
                    return [];
                }),
                this.analyticsService.getPlatformDistribution(startDate, endDate).catch(e => {
                    console.error('Analytics Error (Platform):', e);
                    return [];
                }),
                this.analyticsService.getDailyPlatformDistribution(startDate, endDate).catch(e => {
                    console.error('Analytics Error (DailyPlatform):', e);
                    return [];
                }),
                this.getKycPerformance().catch(e => {
                    console.error('KycPerformance Error:', e);
                    return { medianDaysToFirstRedemption: 0 };
                }),
            ]);




            return {
                platformOverview,
                userManagement,
                topPerformingMerchants: topMerchants,
                universityDistribution: universityDist,
                leaderboardTopPerformers: leaderboard,
                foundersClubMembers: foundersClub,
                funnelStats,
                onboardingDropoff,
                platformDistribution,
                dailyPlatformDistribution,
                kycPerformance,
            };

        } catch (error) {
            console.error('CRITICAL: getDashboardStats failed:', error);
            throw error;
        }
    }


    private async getPlatformOverview(startDate?: Date, endDate?: Date) {
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = startOfCurrentMonth;

        // Total active students
        const totalActiveStudents = await this.prisma.students.count({
            where: {
                verification_status: 'approved',
                users: { is_active: true },
            },
        });

        // Students approved last month (for growth calc)
        const lastMonthStudents = await this.prisma.students.count({
            where: {
                verification_status: 'approved',
                verified_at: {
                    gte: startOfLastMonth,
                    lt: endOfLastMonth,
                },
            },
        });

        // Students approved this month
        const thisMonthStudents = await this.prisma.students.count({
            where: {
                verification_status: 'approved',
                verified_at: {
                    gte: startOfCurrentMonth,
                },
            },
        });

        // Calculate growth
        const studentGrowth =
            lastMonthStudents > 0
                ? ((thisMonthStudents - lastMonthStudents) / lastMonthStudents) * 100
                : 0;

        // Total verified merchants
        const totalVerifiedMerchants = await this.prisma.merchants.count({
            where: {
                verification_status: 'approved',
                is_active: true,
            },
        });

        // Merchant growth (similar logic)
        const lastMonthMerchants = await this.prisma.merchants.count({
            where: {
                verification_status: 'approved',
                verified_at: {
                    gte: startOfLastMonth,
                    lt: endOfLastMonth,
                },
            },
        });

        const thisMonthMerchants = await this.prisma.merchants.count({
            where: {
                verification_status: 'approved',
                verified_at: {
                    gte: startOfCurrentMonth,
                },
            },
        });

        const merchantGrowth =
            lastMonthMerchants > 0
                ? ((thisMonthMerchants - lastMonthMerchants) / lastMonthMerchants) * 100
                : 0;

        // Total redemptions (All Time)
        const totalRedemptions = await this.prisma.redemptions.count();

        return {
            totalActiveStudents,
            totalActiveStudentsGrowth: Math.round(studentGrowth),
            totalVerifiedMerchants,
            totalVerifiedMerchantsGrowth: Math.round(merchantGrowth),
            totalRedemptions,
        };
    }

    private async getUserManagement() {
        // Pending KYC submissions
        const verificationQueue = await this.prisma.student_kyc.count({
            where: {
                reviewed_at: null,
            },
        });

        // Rejected students + inactive users
        const rejectedStudents = await this.prisma.students.count({
            where: {
                verification_status: 'rejected',
            },
        });

        const inactiveUsers = await this.prisma.public_users.count({
            where: {
                is_active: false,
                role: 'student',
            },
        });

        return {
            verificationQueue,
            suspendedRejected: rejectedStudents + inactiveUsers,
        };
    }

    async getTopMerchants(startDate?: Date, endDate?: Date) {
        // Prepare redemption filter
        const redemptionWhere: any = {};
        if (startDate || endDate) {
            redemptionWhere.created_at = {};
            if (startDate) redemptionWhere.created_at.gte = startDate;
            if (endDate) redemptionWhere.created_at.lte = endDate;
        }

        // Get all approved merchants with their branch redemption counts (DB-level aggregation)
        const merchants = await this.prisma.merchants.findMany({
            where: {
                verification_status: 'approved',
            },
            select: {
                id: true,
                business_name: true,
                category: true,
                logo_path: true,
                merchant_branches: {
                    select: {
                        id: true,
                        branch_name: true,
                        _count: {
                            select: {
                                redemptions: { where: redemptionWhere },
                            },
                        },
                    },
                },
            },
        });

        // Calculate redemption counts and format response
        const merchantsWithCounts = merchants
            .map((merchant) => {
                const branches = merchant.merchant_branches.map((branch) => ({
                    id: branch.id,
                    branchName: branch.branch_name,
                    redemptionCount: branch._count.redemptions,
                })).sort((a, b) => b.redemptionCount - a.redemptionCount);

                const redemptionCount = branches.reduce(
                    (total, branch) => total + branch.redemptionCount,
                    0,
                );

                return {
                    id: merchant.id,
                    businessName: merchant.business_name,
                    redemptionCount,
                    category: merchant.category,
                    logoPath: merchant.logo_path,
                    branches,
                };
            })
            .sort((a, b) => b.redemptionCount - a.redemptionCount);
        // Limit removed to show all merchants as requested

        return merchantsWithCounts;
    }

    private async getUniversityDistribution() {
        // Group students by university
        const universities = await this.prisma.students.groupBy({
            by: ['university'],
            where: {
                verification_status: 'approved',
            },
            _count: {
                university: true,
            },
            orderBy: {
                _count: {
                    university: 'desc',
                },
            },
        });

        const totalStudents = universities.reduce(
            (sum, u) => sum + u._count.university,
            0,
        );

        return universities.map((u) => ({
            university: u.university,
            studentCount: u._count.university,
            percentage:
                totalStudents > 0
                    ? Math.round((u._count.university / totalStudents) * 100)
                    : 0,
        }));
    }

    private async getLeaderboardCount() {
        // Students with 10+ redemptions
        return this.prisma.students.count({
            where: {
                total_redemptions: {
                    gte: 10,
                },
            },
        });
    }

    private async getFoundersClubCount() {
        return this.prisma.students.count({
            where: {
                is_founders_club: true,
            },
        });
    }

    async getFinancialOverview(startDate?: Date, endDate?: Date) {
        // Prepare date filter
        const dateFilter: any = {};
        if (startDate) dateFilter.gte = startDate;
        if (endDate) dateFilter.lte = endDate;

        // Fetch all approved merchants with their branches and redemption counts
        const merchants = await this.prisma.merchants.findMany({
            where: {
                verification_status: 'approved',
                is_active: true, // Optional: only active merchants? Or all for financial history?
            },
            select: {
                id: true,
                business_name: true,
                redemption_fee: true,
                merchant_branches: {
                    select: {
                        id: true,
                        branch_name: true,
                        _count: {
                            select: {
                                redemptions: {
                                    where: {
                                        created_at: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Calculate financials
        let grandTotalReceivables = 0;

        const processedMerchants = merchants.map(merchant => {
            const feePerRedemption = Number(merchant.redemption_fee || 0);
            let merchantTotalRedemptions = 0;
            let merchantTotalReceivables = 0;

            const branches = merchant.merchant_branches.map(branch => {
                const count = branch._count.redemptions;
                const receivables = count * feePerRedemption;

                merchantTotalRedemptions += count;
                merchantTotalReceivables += receivables;

                return {
                    id: branch.id,
                    name: branch.branch_name,
                    redemptionCount: count,
                    receivables: receivables,
                };
            });

            grandTotalReceivables += merchantTotalReceivables;

            return {
                id: merchant.id,
                name: merchant.business_name,
                redemptionFee: feePerRedemption,
                totalRedemptions: merchantTotalRedemptions,
                totalReceivables: merchantTotalReceivables,
                branches: branches.sort((a, b) => b.receivables - a.receivables), // Sort branches by revenue
            };
        });

        // Sort merchants by total receivables
        processedMerchants.sort((a, b) => b.totalReceivables - a.totalReceivables);

        return {
            grandTotalReceivables,
            merchants: processedMerchants,
        };
    }

    async getBranchRedemptions(branchId: string, startDate?: Date, endDate?: Date) {
        const whereClause: any = {
            branch_id: branchId,
        };

        if (startDate || endDate) {
            whereClause.created_at = {};
            if (startDate) whereClause.created_at.gte = startDate;
            if (endDate) whereClause.created_at.lte = endDate;
        }

        const redemptions = await this.prisma.redemptions.findMany({
            where: whereClause,
            include: {
                students: {
                    select: {
                        id: true,
                        parchi_id: true,
                        first_name: true,
                        last_name: true,
                        university: true,
                    },
                },
                offers: {
                    select: {
                        title: true,
                        discount_value: true,
                        discount_type: true,
                    },
                },
                merchant_branches: { // To get redemption fee if needed, accessible via merchant
                   select: {
                       merchants: {
                           select: {
                               redemption_fee: true
                           }
                       }
                   }
                }
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        return redemptions.map(r => ({
            id: r.id,
            date: r.created_at,
            studentName: `${r.students.first_name} ${r.students.last_name}`,
            parchiId: r.students.parchi_id,
            university: r.students.university,
            offerTitle: r.offers.title,
            discount: `${r.offers.discount_value}${r.offers.discount_type === 'percentage' ? '%' : ' PKR'}`,
            payableAmount: Number(r.merchant_branches?.merchants?.redemption_fee || 0),
            status: r.verified_by ? 'Verified' : 'Pending', // Or however you want to display status
        }));
    }

    async getCorporateRedemptions(merchantId: string, startDate?: Date, endDate?: Date) {
        const whereClause: any = {
            merchant_branches: {
                merchant_id: merchantId
            }
        };

        if (startDate || endDate) {
            whereClause.created_at = {};
            if (startDate) whereClause.created_at.gte = startDate;
            if (endDate) whereClause.created_at.lte = endDate;
        }

        const redemptions = await this.prisma.redemptions.findMany({
            where: whereClause,
            include: {
                students: {
                    select: {
                        id: true,
                        parchi_id: true,
                        first_name: true,
                        last_name: true,
                        university: true,
                    },
                },
                offers: {
                    select: {
                        title: true,
                        discount_value: true,
                        discount_type: true,
                    },
                },
                merchant_branches: {
                    select: {
                        branch_name: true,
                        merchants: {
                            select: {
                                redemption_fee: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        return redemptions.map(r => ({
            id: r.id,
            date: r.created_at,
            studentName: `${r.students.first_name} ${r.students.last_name}`,
            parchiId: r.students.parchi_id,
            university: r.students.university,
            branchName: r.merchant_branches.branch_name,
            offerTitle: r.offers.title,
            discount: `${r.offers.discount_value}${r.offers.discount_type === 'percentage' ? '%' : ' PKR'}`,
            payableAmount: Number(r.merchant_branches?.merchants?.redemption_fee || 0),
            status: r.verified_by ? 'Verified' : 'Pending',
        }));
    }

    private async getKycPerformance() {
        // Fetch only the necessary fields for calculation to keep it fast
        const studentsWithRedemptions = await this.prisma.students.findMany({
            where: {
                verification_status: 'approved',
                redemptions: { some: {} },
                verified_at: { not: null },
            },
            select: {
                verified_at: true,
                redemptions: {
                    orderBy: { created_at: 'asc' },
                    take: 1,
                    select: { created_at: true },
                },
            },
        });

        if (studentsWithRedemptions.length === 0) {
            return { medianDaysToFirstRedemption: 0 };
        }

        const daysToRedeem = studentsWithRedemptions
            .map((s) => {
                const firstRedemption = s.redemptions[0];
                if (!s.verified_at || !firstRedemption || !firstRedemption.created_at) return null;
                const diffMs = firstRedemption.created_at.getTime() - s.verified_at.getTime();
                return diffMs / (1000 * 60 * 60 * 24);
            })
            .filter((d): d is number => d !== null && d >= 0)
            .sort((a, b) => a - b);

        if (daysToRedeem.length === 0) {
            return { medianDaysToFirstRedemption: 0 };
        }

        const mid = Math.floor(daysToRedeem.length / 2);
        const median =
            daysToRedeem.length % 2 !== 0
                ? daysToRedeem[mid]
                : (daysToRedeem[mid - 1] + daysToRedeem[mid]) / 2;

        return { medianDaysToFirstRedemption: Math.round(median * 10) / 10 };
    }

    async getRedemptionAnalytics(): Promise<RedemptionAnalyticsResponse> {
        const [
            uniqueRedeemersResult,
            dailyTrends,
            weeklyTrends,
            monthlyTrends,
            histogramResult,
            repeatRatesResult,
            bonusResult,
        ] = await Promise.all([
            // 1. Unique redeemers (verified, non-rejected)
            this.prisma.$queryRaw<[{ count: number }]>`
                SELECT COUNT(DISTINCT student_id)::int AS count
                FROM redemptions
                WHERE verified_by IS NOT NULL
                  AND (notes IS NULL OR notes NOT ILIKE 'REJECTED%')
            `,
            // 2. Daily volume – last 30 days (PKT timezone)
            this.prisma.$queryRaw<Array<{ date: string; count: number }>>`
                SELECT
                    TO_CHAR(created_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS date,
                    COUNT(*)::int AS count
                FROM redemptions
                WHERE verified_by IS NOT NULL
                  AND (notes IS NULL OR notes NOT ILIKE 'REJECTED%')
                  AND created_at >= NOW() - INTERVAL '30 days'
                GROUP BY date
                ORDER BY date
            `,
            // 3. Weekly volume – last 12 weeks
            this.prisma.$queryRaw<Array<{ date: string; count: number }>>`
                SELECT
                    TO_CHAR(DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Karachi'), 'YYYY-MM-DD') AS date,
                    COUNT(*)::int AS count
                FROM redemptions
                WHERE verified_by IS NOT NULL
                  AND (notes IS NULL OR notes NOT ILIKE 'REJECTED%')
                  AND created_at >= NOW() - INTERVAL '12 weeks'
                GROUP BY date
                ORDER BY date
            `,
            // 4. Monthly volume – last 12 months
            this.prisma.$queryRaw<Array<{ date: string; count: number }>>`
                SELECT
                    TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Karachi'), 'YYYY-MM') AS date,
                    COUNT(*)::int AS count
                FROM redemptions
                WHERE verified_by IS NOT NULL
                  AND (notes IS NULL OR notes NOT ILIKE 'REJECTED%')
                  AND created_at >= NOW() - INTERVAL '12 months'
                GROUP BY date
                ORDER BY date
            `,
            // 5. User behavior histogram (1, 2, 3, 4+ redemptions per user)
            this.prisma.$queryRaw<[{
                exactly_one: number;
                exactly_two: number;
                exactly_three: number;
                four_or_more: number;
            }]>`
                WITH user_counts AS (
                    SELECT student_id, COUNT(*) AS redemption_count
                    FROM redemptions
                    WHERE verified_by IS NOT NULL
                      AND (notes IS NULL OR notes NOT ILIKE 'REJECTED%')
                    GROUP BY student_id
                )
                SELECT
                    COALESCE(SUM(CASE WHEN redemption_count = 1  THEN 1 ELSE 0 END), 0)::int AS exactly_one,
                    COALESCE(SUM(CASE WHEN redemption_count = 2  THEN 1 ELSE 0 END), 0)::int AS exactly_two,
                    COALESCE(SUM(CASE WHEN redemption_count = 3  THEN 1 ELSE 0 END), 0)::int AS exactly_three,
                    COALESCE(SUM(CASE WHEN redemption_count >= 4 THEN 1 ELSE 0 END), 0)::int AS four_or_more
                FROM user_counts
            `,
            // 6. Repeat rates within 7 / 30 / 90 days of first redemption
            this.prisma.$queryRaw<[{
                total_redeemers: number;
                repeat_7:  number;
                repeat_30: number;
                repeat_90: number;
            }]>`
                WITH first_redemptions AS (
                    SELECT student_id, MIN(created_at) AS first_at
                    FROM redemptions
                    WHERE verified_by IS NOT NULL
                      AND (notes IS NULL OR notes NOT ILIKE 'REJECTED%')
                    GROUP BY student_id
                )
                SELECT
                    COUNT(DISTINCT fr.student_id)::int AS total_redeemers,
                    COUNT(DISTINCT CASE
                        WHEN r2.created_at > fr.first_at
                         AND r2.created_at <= fr.first_at + INTERVAL '7 days'
                        THEN fr.student_id
                    END)::int AS repeat_7,
                    COUNT(DISTINCT CASE
                        WHEN r2.created_at > fr.first_at
                         AND r2.created_at <= fr.first_at + INTERVAL '30 days'
                        THEN fr.student_id
                    END)::int AS repeat_30,
                    COUNT(DISTINCT CASE
                        WHEN r2.created_at > fr.first_at
                         AND r2.created_at <= fr.first_at + INTERVAL '90 days'
                        THEN fr.student_id
                    END)::int AS repeat_90
                FROM first_redemptions fr
                LEFT JOIN redemptions r2
                    ON  r2.student_id = fr.student_id
                    AND r2.verified_by IS NOT NULL
                    AND (r2.notes IS NULL OR r2.notes NOT ILIKE 'REJECTED%')
            `,
            // 7. 5th-bonus trigger stats
            this.prisma.$queryRaw<[{
                total_bonus_triggers:       number;
                unique_students_triggered:  number;
                users_returned_after_bonus: number;
            }]>`
                WITH bonus_events AS (
                    SELECT id, student_id, created_at
                    FROM redemptions
                    WHERE is_bonus_applied = true
                      AND verified_by IS NOT NULL
                      AND (notes IS NULL OR notes NOT ILIKE 'REJECTED%')
                )
                SELECT
                    COUNT(be.id)::int                       AS total_bonus_triggers,
                    COUNT(DISTINCT be.student_id)::int       AS unique_students_triggered,
                    COUNT(DISTINCT CASE
                        WHEN r.created_at > be.created_at
                         AND r.created_at <= be.created_at + INTERVAL '30 days'
                        THEN be.student_id
                    END)::int                               AS users_returned_after_bonus
                FROM bonus_events be
                LEFT JOIN redemptions r
                    ON  r.student_id      = be.student_id
                    AND r.verified_by     IS NOT NULL
                    AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED%')
                    AND r.is_bonus_applied = false
            `,
        ]);

        // --- Transform results (handle both number and bigint returns depending on PG driver) ---
        const uniqueRedeemers = Number(uniqueRedeemersResult[0]?.count ?? 0);

        const hist = histogramResult[0];
        const behaviorHistogram = [
            { bucket: '1',  userCount: Number(hist?.exactly_one   ?? 0) },
            { bucket: '2',  userCount: Number(hist?.exactly_two   ?? 0) },
            { bucket: '3',  userCount: Number(hist?.exactly_three ?? 0) },
            { bucket: '4+', userCount: Number(hist?.four_or_more  ?? 0) },
        ];

        const rr = repeatRatesResult[0];
        const totalRedeemers = Number(rr?.total_redeemers ?? 0);
        const repeatRates = ([7, 30, 90] as const).map((days) => {
            const key = `repeat_${days}` as 'repeat_7' | 'repeat_30' | 'repeat_90';
            const repeatCount = Number(rr?.[key] ?? 0);
            return {
                windowDays: days,
                repeatCount,
                totalRedeemers,
                repeatRate: totalRedeemers > 0
                    ? Math.round((repeatCount / totalRedeemers) * 1000) / 10
                    : 0,
            };
        });

        const bonus = bonusResult[0];
        const totalBonusTriggers      = Number(bonus?.total_bonus_triggers       ?? 0);
        const uniqueStudentsTriggered = Number(bonus?.unique_students_triggered  ?? 0);
        const usersReturnedAfterBonus = Number(bonus?.users_returned_after_bonus ?? 0);
        const fifthBonusStats = {
            totalBonusTriggers,
            uniqueStudentsTriggered,
            usersReturnedAfterBonus,
            conversionRate: uniqueStudentsTriggered > 0
                ? Math.round((usersReturnedAfterBonus / uniqueStudentsTriggered) * 1000) / 10
                : 0,
        };

        return {
            uniqueRedeemers,
            volumeTrends: {
                daily:   dailyTrends.map(r   => ({ date: r.date,   count: Number(r.count) })),
                weekly:  weeklyTrends.map(r  => ({ date: r.date,   count: Number(r.count) })),
                monthly: monthlyTrends.map(r => ({ date: r.date,   count: Number(r.count) })),
            },
            behaviorHistogram,
            repeatRates,
            fifthBonusStats,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Brand Partner & Portfolio Health
    // ─────────────────────────────────────────────────────────────────────────

    async getBrandPortfolioHealth(): Promise<BrandPortfolioHealthResponse> {
        const [
            weeklyTrendRows,
            reachRows,
            concentrationRows,
            dryRows,
        ] = await Promise.all([
            // 1. Rolling 4-week redemptions per brand per week
            this.prisma.$queryRaw<Array<{
                merchant_id:      string;
                business_name:    string;
                logo_path:        string | null;
                category:         string | null;
                week_start:       string;
                redemption_count: number;
            }>>`
                SELECT
                    m.id                                                                   AS merchant_id,
                    m.business_name,
                    m.logo_path,
                    m.category,
                    TO_CHAR(
                        DATE_TRUNC('week', r.created_at AT TIME ZONE 'Asia/Karachi'),
                        'YYYY-MM-DD'
                    )                                                                      AS week_start,
                    COUNT(r.id)::int                                                       AS redemption_count
                FROM merchants m
                JOIN merchant_branches mb ON mb.merchant_id = m.id
                JOIN redemptions r         ON r.branch_id   = mb.id
                WHERE m.verification_status = 'approved'
                  AND r.verified_by IS NOT NULL
                  AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED%')
                  AND r.created_at >= NOW() - INTERVAL '4 weeks'
                GROUP BY m.id, m.business_name, m.logo_path, m.category, week_start
                ORDER BY m.business_name, week_start
            `,

            // 2. Unique redeemers + total redemptions per brand (all-time)
            this.prisma.$queryRaw<Array<{
                merchant_id:       string;
                business_name:     string;
                logo_path:         string | null;
                category:          string | null;
                unique_redeemers:  number;
                total_redemptions: number;
            }>>`
                SELECT
                    m.id                                    AS merchant_id,
                    m.business_name,
                    m.logo_path,
                    m.category,
                    COUNT(DISTINCT r.student_id)::int       AS unique_redeemers,
                    COUNT(r.id)::int                        AS total_redemptions
                FROM merchants m
                LEFT JOIN merchant_branches mb ON mb.merchant_id = m.id
                LEFT JOIN redemptions r
                    ON  r.branch_id   = mb.id
                    AND r.verified_by IS NOT NULL
                    AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED%')
                WHERE m.verification_status = 'approved'
                  AND m.is_active = true
                GROUP BY m.id, m.business_name, m.logo_path, m.category
                ORDER BY unique_redeemers DESC
            `,

            // 3. Brand concentration — share of total redemptions per brand
            this.prisma.$queryRaw<Array<{
                merchant_id:       string;
                business_name:     string;
                redemption_count:  number;
                share_pct:         number;
            }>>`
                WITH brand_totals AS (
                    SELECT
                        m.id               AS merchant_id,
                        m.business_name,
                        COUNT(r.id)::int   AS redemption_count
                    FROM merchants m
                    JOIN merchant_branches mb ON mb.merchant_id = m.id
                    JOIN redemptions r         ON r.branch_id   = mb.id
                    WHERE m.verification_status = 'approved'
                      AND r.verified_by IS NOT NULL
                      AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED%')
                    GROUP BY m.id, m.business_name
                ),
                grand AS (
                    SELECT SUM(redemption_count) AS total FROM brand_totals
                )
                SELECT
                    bt.merchant_id,
                    bt.business_name,
                    bt.redemption_count,
                    ROUND(bt.redemption_count * 100.0 / NULLIF(g.total, 0), 1)::float AS share_pct
                FROM brand_totals bt
                CROSS JOIN grand g
                ORDER BY bt.redemption_count DESC
            `,

            // 4. Dry partner flags — active approved merchants with low/zero recent activity
            this.prisma.$queryRaw<Array<{
                merchant_id:            string;
                business_name:          string;
                logo_path:              string | null;
                category:               string | null;
                redemptions_last_7:     number;
                redemptions_last_30:    number;
                last_redemption_at:     Date | null;
            }>>`
                SELECT
                    m.id                                                              AS merchant_id,
                    m.business_name,
                    m.logo_path,
                    m.category,
                    COALESCE(SUM(
                        CASE WHEN r.created_at >= NOW() - INTERVAL '7 days'  THEN 1 ELSE 0 END
                    ), 0)::int                                                        AS redemptions_last_7,
                    COALESCE(SUM(
                        CASE WHEN r.created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END
                    ), 0)::int                                                        AS redemptions_last_30,
                    MAX(r.created_at)                                                AS last_redemption_at
                FROM merchants m
                LEFT JOIN merchant_branches mb ON mb.merchant_id = m.id
                LEFT JOIN redemptions r
                    ON  r.branch_id   = mb.id
                    AND r.verified_by IS NOT NULL
                    AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED%')
                WHERE m.verification_status = 'approved'
                  AND m.is_active = true
                GROUP BY m.id, m.business_name, m.logo_path, m.category
                HAVING
                    COALESCE(SUM(
                        CASE WHEN r.created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END
                    ), 0) = 0
                    OR COALESCE(SUM(
                        CASE WHEN r.created_at >= NOW() - INTERVAL '7 days'  THEN 1 ELSE 0 END
                    ), 0) < 3
                ORDER BY redemptions_last_30 ASC, m.business_name
            `,
        ]);

        // ── 1. Build brand trends ─────────────────────────────────────────
        const trendMap = new Map<string, {
            merchantId: string;
            businessName: string;
            logoPath: string | null;
            category: string | null;
            weeks: Map<string, number>;
        }>();

        for (const row of weeklyTrendRows) {
            if (!trendMap.has(row.merchant_id)) {
                trendMap.set(row.merchant_id, {
                    merchantId:   row.merchant_id,
                    businessName: row.business_name,
                    logoPath:     row.logo_path,
                    category:     row.category,
                    weeks:        new Map(),
                });
            }
            trendMap.get(row.merchant_id)!.weeks.set(row.week_start, Number(row.redemption_count));
        }

        const brandTrends = Array.from(trendMap.values()).map((m) => {
            const sortedWeeks = Array.from(m.weeks.entries())
                .sort(([a], [b]) => a.localeCompare(b));
            const weeklyTrend = sortedWeeks.map(([weekStart, redemptionCount]) => ({
                weekStart,
                redemptionCount,
            }));
            const total = weeklyTrend.reduce((s, w) => s + w.redemptionCount, 0);

            let trendDirection: 'up' | 'down' | 'flat' = 'flat';
            if (weeklyTrend.length >= 2) {
                const last  = weeklyTrend[weeklyTrend.length - 1].redemptionCount;
                const prev  = weeklyTrend[weeklyTrend.length - 2].redemptionCount;
                if (last > prev)      trendDirection = 'up';
                else if (last < prev) trendDirection = 'down';
            }

            return {
                merchantId:     m.merchantId,
                businessName:   m.businessName,
                logoPath:       m.logoPath,
                category:       m.category,
                weeklyTrend,
                totalLast4Weeks: total,
                trendDirection,
            };
        }).sort((a, b) => b.totalLast4Weeks - a.totalLast4Weeks);

        // ── 2. Brand reach ────────────────────────────────────────────────
        const brandReach = reachRows.map((r) => ({
            merchantId:       r.merchant_id,
            businessName:     r.business_name,
            logoPath:         r.logo_path,
            category:         r.category,
            uniqueRedeemers:  Number(r.unique_redeemers),
            totalRedemptions: Number(r.total_redemptions),
        }));

        // ── 3. Concentration ──────────────────────────────────────────────
        const concBrands = concentrationRows.map((r) => ({
            merchantId:      r.merchant_id,
            businessName:    r.business_name,
            redemptionCount: Number(r.redemption_count),
            sharePct:        Number(r.share_pct),
        }));

        const totalRedemptions = concBrands.reduce((s, b) => s + b.redemptionCount, 0);
        const top3SharePct  = concBrands.slice(0, 3).reduce((s, b) => s + b.sharePct, 0);
        const top5SharePct  = concBrands.slice(0, 5).reduce((s, b) => s + b.sharePct, 0);
        const hhi = concBrands.reduce((s, b) => s + Math.pow(b.sharePct, 2), 0);

        const concentration = {
            totalRedemptions,
            top3SharePct: Math.round(top3SharePct * 10) / 10,
            top5SharePct: Math.round(top5SharePct * 10) / 10,
            hhi:          Math.round(hhi),
            brands:       concBrands,
        };

        // ── 4. Dry partners ───────────────────────────────────────────────
        const dryPartners = dryRows.map((r) => ({
            merchantId:           r.merchant_id,
            businessName:         r.business_name,
            logoPath:             r.logo_path,
            category:             r.category,
            redemptionsLast7Days: Number(r.redemptions_last_7),
            redemptionsLast30Days: Number(r.redemptions_last_30),
            lastRedemptionAt:     r.last_redemption_at
                ? (r.last_redemption_at as Date).toISOString()
                : null,
            severity: Number(r.redemptions_last_30) === 0
                ? ('zero' as const)
                : ('low'  as const),
        }));

        return { brandTrends, brandReach, concentration, dryPartners };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Competitor Benchmarking
    // ─────────────────────────────────────────────────────────────────────────

    async getCompetitorBenchmarks(): Promise<CompetitorBenchmarksResponse> {
        const entries = await this.prisma.competitor_benchmarks.findMany({
            orderBy: [{ competitor_name: 'asc' }, { metric_name: 'asc' }, { recorded_at: 'desc' }],
        });

        // Build latest-per-competitor+metric map for the comparison table
        const latestMap = new Map<string, { competitorName: string; metricName: string; metricValue: number }>();
        for (const e of entries) {
            const key = `${e.competitor_name}::${e.metric_name}`;
            if (!latestMap.has(key)) {
                latestMap.set(key, {
                    competitorName: e.competitor_name,
                    metricName:     e.metric_name,
                    metricValue:    Number(e.metric_value),
                });
            }
        }

        // Compute Parchi live values for known metrics
        const [totalRedemptionsResult, activeStudentsResult, activeMerchantsResult] = await Promise.all([
            this.prisma.redemptions.count({
                where: {
                    verified_by: { not: null },
                    NOT: { notes: { startsWith: 'REJECTED' } },
                },
            }),
            this.prisma.students.count({ where: { verification_status: 'approved', users: { is_active: true } } }),
            this.prisma.merchants.count({ where: { verification_status: 'approved', is_active: true } }),
        ]);

        const parchiValues: Record<string, number> = {
            total_redemptions: totalRedemptionsResult,
            active_students:   activeStudentsResult,
            active_brands:     activeMerchantsResult,
        };

        // Group competitor latest values by metric
        const metricGroups = new Map<string, Array<{ name: string; value: number }>>();
        for (const v of latestMap.values()) {
            if (!metricGroups.has(v.metricName)) metricGroups.set(v.metricName, []);
            metricGroups.get(v.metricName)!.push({ name: v.competitorName, value: v.metricValue });
        }

        const comparison = Array.from(metricGroups.entries()).map(([metricName, competitors]) => {
            const parchiValue = parchiValues[metricName] ?? 0;
            return {
                metricName,
                parchiValue,
                competitors: competitors.map((c) => {
                    const delta = parchiValue - c.value;
                    return {
                        name:           c.name,
                        value:          c.value,
                        delta:          Math.abs(delta),
                        deltaDirection: delta > 0
                            ? ('ahead'  as const)
                            : delta < 0
                            ? ('behind' as const)
                            : ('tied'   as const),
                    };
                }),
            };
        });

        return {
            entries: entries.map((e) => ({
                id:             e.id,
                competitorName: e.competitor_name,
                metricName:     e.metric_name,
                metricValue:    Number(e.metric_value),
                recordedAt:     e.recorded_at.toISOString(),
                notes:          e.notes ?? null,
                sourceUrl:      e.source_url ?? null,
            })),
            comparison,
        };
    }

    async upsertCompetitorBenchmark(
        dto: UpsertCompetitorBenchmarkDto,
        adminUserId: string,
    ): Promise<{ id: string }> {
        const created = await this.prisma.competitor_benchmarks.create({
            data: {
                competitor_name: dto.competitorName,
                metric_name:     dto.metricName,
                metric_value:    dto.metricValue,
                recorded_at:     dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
                notes:           dto.notes     ?? null,
                source_url:      dto.sourceUrl ?? null,
                created_by:      adminUserId,
            },
        });
        return { id: created.id };
    }

    async deleteCompetitorBenchmark(id: string): Promise<void> {
        await this.prisma.competitor_benchmarks.delete({ where: { id } });
    }
}
