import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardStatsResponse } from './dto/dashboard-stats-response.dto';

@Injectable()
export class AdminDashboardService {
    constructor(private readonly prisma: PrismaService) { }

    async getDashboardStats(startDate?: Date, endDate?: Date): Promise<AdminDashboardStatsResponse> {
        // Run all queries in parallel for performance
        const [
            platformOverview,
            userManagement,
            topMerchants,
            universityDist,
            leaderboard,
            foundersClub,
        ] = await Promise.all([
            this.getPlatformOverview(startDate, endDate),
            this.getUserManagement(),
            this.getTopMerchants(startDate, endDate),
            this.getUniversityDistribution(),
            this.getLeaderboardCount(),
            this.getFoundersClubCount(),
        ]);

        return {
            platformOverview,
            userManagement,
            topPerformingMerchants: topMerchants,
            universityDistribution: universityDist,
            leaderboardTopPerformers: leaderboard,
            foundersClubMembers: foundersClub,
        };
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

        // Get all approved merchants with their branch redemptions
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
                        redemptions: {
                            where: redemptionWhere,
                            select: {
                                id: true,
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
                    redemptionCount: branch.redemptions.length,
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
                        redemptions: {
                            where: {
                                created_at: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
                            },
                            select: {
                                id: true,
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
                const count = branch.redemptions.length;
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
}
