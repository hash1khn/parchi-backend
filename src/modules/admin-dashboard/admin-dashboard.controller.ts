import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    HttpCode,
    HttpStatus,
    UseGuards,
    Query,
    Param,
} from '@nestjs/common';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { AdminDashboardService } from './admin-dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('admin/dashboard')
export class AdminDashboardController {
    constructor(private readonly adminDashboardService: AdminDashboardService) { }

    @Get('stats')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getDashboardStats(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('groupBy') groupBy: 'institution' | 'city' = 'institution',
    ) {
        const data = await this.adminDashboardService.getDashboardStats(
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            groupBy,
        );
        return createApiResponse(
            data,
            'Dashboard statistics retrieved successfully',
        );
    }

    @Get('signup-funnel')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getSignupFunnel() {
        const data = await this.adminDashboardService.getSignupDropoff();
        return createApiResponse(
            data,
            'Signup funnel statistics retrieved successfully',
        );
    }

    @Get('kyc-stats')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getKycStats() {
        const data = await this.adminDashboardService.getKycRejectionStats();
        return createApiResponse(
            data,
            'KYC rejection statistics retrieved successfully',
        );
    }

    @Get('active-users')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getActiveUsers() {
        const data = await this.adminDashboardService.getActiveUserTracking();
        return createApiResponse(
            data,
            'Active user tracking data retrieved successfully',
        );
    }

    @Get('top-merchants')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getTopMerchants(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const data = await this.adminDashboardService.getTopMerchants(
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
        return createApiResponse(
            data,
            'Top merchants retrieved successfully',
        );
    }

    @Get('top-weekly-redeemers')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getTopWeeklyRedeemers(@Query('limit') limit?: string) {
        const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10;
        const data = await this.adminDashboardService.getTopWeeklyRedeemers(parsedLimit);
        return createApiResponse(
            data,
            'Top weekly redeemers retrieved successfully',
        );
    }

    @Get('financials')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getFinancialOverview(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const data = await this.adminDashboardService.getFinancialOverview(
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
        return createApiResponse(
            data,
            'Financial overview retrieved successfully',
        );
    }

    @Get('branch-redemptions/:branchId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getBranchRedemptions(
        @Param('branchId') branchId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const data = await this.adminDashboardService.getBranchRedemptions(
            branchId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
        return createApiResponse(
            data,
            'Branch redemptions retrieved successfully',
        );
    }

    @Get('corporate-redemptions/:merchantId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getCorporateRedemptions(
        @Param('merchantId') merchantId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const data = await this.adminDashboardService.getCorporateRedemptions(
            merchantId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
        return createApiResponse(
            data,
            'Corporate redemptions retrieved successfully',
        );
    }

    @Get('redemption-analytics')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getRedemptionAnalytics(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('studentId') studentId?: string,
    ) {
        const data = await this.adminDashboardService.getRedemptionAnalytics(
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            studentId,
        );
        return createApiResponse(data, 'Redemption analytics retrieved successfully');
    }

    @Get('brand-portfolio')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getBrandPortfolioHealth() {
        const data = await this.adminDashboardService.getBrandPortfolioHealth();
        return createApiResponse(data, 'Brand portfolio health retrieved successfully');
    }

    @Get('competitor-benchmarks')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async getCompetitorBenchmarks() {
        const data = await this.adminDashboardService.getCompetitorBenchmarks();
        return createApiResponse(data, 'Competitor benchmarks retrieved successfully');
    }

    @Post('competitor-benchmarks')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.CREATED)
    async addCompetitorBenchmark(
        @Body() body: {
            competitorName: string;
            metricName: string;
            metricValue: number;
            recordedAt?: string;
            notes?: string;
            sourceUrl?: string;
        },
        @CurrentUser() user: { id: string },
    ) {
        const data = await this.adminDashboardService.upsertCompetitorBenchmark(body, user.id);
        return createApiResponse(data, 'Competitor benchmark entry added successfully');
    }

    @Delete('competitor-benchmarks/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(ROLES.ADMIN)
    @HttpCode(HttpStatus.OK)
    async deleteCompetitorBenchmark(@Param('id') id: string) {
        await this.adminDashboardService.deleteCompetitorBenchmark(id);
        return createApiResponse(null, 'Competitor benchmark entry deleted successfully');
    }
}
