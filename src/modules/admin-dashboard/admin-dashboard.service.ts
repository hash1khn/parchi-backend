import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardStatsResponse } from './dto/dashboard-stats-response.dto';

@Injectable()
export class AdminDashboardService {
    constructor(private readonly prisma: PrismaService) { }

    async getDashboardStats(): Promise<AdminDashboardStatsResponse> {
        // Run all queries in parallel for performance
        const [
            platformOverview,
            userManagement,
            topMerchants,
            universityDist,
            leaderboard,
            foundersClub,
        ] = await Promise.all([
            this.getPlatformOverview(),
            this.getUserManagement(),
            this.getTopMerchants(),
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

    private async getPlatformOverview() {
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

        // Total redemptions
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

    

    private async getTopMerchants() {
        // Get top 10 merchants by redemption count
        const topMerchants = await this.prisma.merchants.findMany({
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
                        redemptions: {
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            },
        });

        // Calculate redemption counts and sort
        const merchantsWithCounts = topMerchants
            .map((merchant) => {
                const redemptionCount = merchant.merchant_branches.reduce(
                    (total, branch) => total + branch.redemptions.length,
                    0,
                );
                return {
                    id: merchant.id,
                    businessName: merchant.business_name,
                    redemptionCount,
                    category: merchant.category,
                    logoPath: merchant.logo_path,
                };
            })
            .sort((a, b) => b.redemptionCount - a.redemptionCount)
            .slice(0, 10);

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
}
