import {
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    UseGuards,
    Query,
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
}
