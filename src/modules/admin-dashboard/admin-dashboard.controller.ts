import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    UseGuards,
    Query,
    Param,

} from '@nestjs/common';
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
    ) {
        const data = await this.adminDashboardService.getDashboardStats(
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
        return createApiResponse(
            data,
            'Dashboard statistics retrieved successfully',
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
}
