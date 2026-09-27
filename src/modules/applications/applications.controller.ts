import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

/**
 * Admin-only endpoints for the two landing-page conversion forms
 * (Become a Merchant / Become a Campus Ambassador).
 *
 * Submissions are inserted directly by app/api/applications/* (Next.js)
 * using the Supabase service-role key — there is no public POST here.
 */
@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ApplicationsController {
    constructor(private readonly applicationsService: ApplicationsService) { }

    @Get('merchants')
    async getMerchantApplications(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
    ) {
        return this.applicationsService.getMerchantApplications(
            page ? parseInt(page, 10) : 1,
            limit ? parseInt(limit, 10) : 20,
            status,
        );
    }

    @Patch('merchants/:id')
    async updateMerchantApplication(@Param('id') id: string, @Body('status') status: string) {
        return this.applicationsService.updateMerchantApplicationStatus(id, status);
    }

    @Get('ambassadors')
    async getAmbassadorApplications(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
    ) {
        return this.applicationsService.getAmbassadorApplications(
            page ? parseInt(page, 10) : 1,
            limit ? parseInt(limit, 10) : 20,
            status,
        );
    }

    @Patch('ambassadors/:id')
    async updateAmbassadorApplication(@Param('id') id: string, @Body('status') status: string) {
        return this.applicationsService.updateAmbassadorApplicationStatus(id, status);
    }
}
