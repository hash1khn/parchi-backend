import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Post,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ROLES } from '../../constants/app.constants';
import { UpdateCorporateAccountDto } from './dto/update-corporate-account.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ApproveRejectBranchDto } from './dto/approve-reject-branch.dto';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';
import { AssignOffersDto } from './dto/assign-offers.dto';
import { UpdateBonusSettingsDto } from './dto/update-bonus-settings.dto';
import { SetFeaturedBrandsDto } from './dto/set-featured-brands.dto';
import { Audit } from '../../decorators/audit.decorator';
import { createApiResponse } from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) { }

  // ========== Corporate Merchant Endpoints (Admin) ==========

  @Get('corporate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getAllCorporateMerchants(
    @CurrentUser() currentUser: ICurrentUser,
    @Query('search') search?: string,
  ) {
    const data = await this.merchantsService.getAllCorporateMerchants(currentUser, search);
    return createApiResponse(data, API_RESPONSE_MESSAGES.MERCHANT.LIST_SUCCESS);
  }

  @Get('brands')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT, ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllBrands() {
    const data = await this.merchantsService.getAllBrands();
    return createApiResponse(data, 'Brands retrieved successfully');
  }

  @Put('brands/featured')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'SET_FEATURED_BRANDS', tableName: 'merchants' })
  async setFeaturedBrands(@Body() setFeaturedBrandsDto: SetFeaturedBrandsDto) {
    const data = await this.merchantsService.setFeaturedBrands(setFeaturedBrandsDto);
    return createApiResponse(data, 'Featured brands updated successfully');
  }

  // Student endpoint for merchant details - placed before other :id routes
  @Get(':id/details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getMerchantDetailsForStudents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.merchantsService.getMerchantDetailsForStudents(
      id,
      currentUser.id,
    );
    return createApiResponse(
      data,
      API_RESPONSE_MESSAGES.MERCHANT.GET_SUCCESS,
    );
  }

  @Get('corporate/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getCorporateAccountById(@Param('id') id: string) {
    const data = await this.merchantsService.getCorporateAccountById(id);
    return createApiResponse(data, API_RESPONSE_MESSAGES.MERCHANT.GET_SUCCESS);
  }

  @Put('corporate/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'UPDATE_MERCHANT', tableName: 'merchants', recordIdParam: 'id' })
  async updateCorporateAccount(
    @Param('id') id: string,
    @Body() updateDto: UpdateCorporateAccountDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.merchantsService.updateCorporateAccount(id, updateDto, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.MERCHANT.UPDATE_SUCCESS);
  }

  @Patch('corporate/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'TOGGLE_MERCHANT_STATUS', tableName: 'merchants', recordIdParam: 'id' })
  async toggleCorporateAccountStatus(@Param('id') id: string) {
    const data = await this.merchantsService.toggleCorporateAccountStatus(id);
    return createApiResponse(data, API_RESPONSE_MESSAGES.MERCHANT.TOGGLE_SUCCESS);
  }

  @Delete('corporate/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'DELETE_MERCHANT', tableName: 'merchants', recordIdParam: 'id' })
  async deleteCorporateAccount(@Param('id') id: string) {
    await this.merchantsService.deleteCorporateAccount(id);
    return createApiResponse(null, API_RESPONSE_MESSAGES.MERCHANT.DELETE_SUCCESS);
  }

  // ========== Corporate Dashboard Endpoints ==========

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getDashboardStats(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.merchantsService.getDashboardStats(currentUser);
    return createApiResponse(data, 'Dashboard stats retrieved successfully');
  }

  @Get('dashboard/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getDashboardAnalytics(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.merchantsService.getDashboardAnalytics(currentUser);
    return createApiResponse(data, 'Analytics retrieved successfully');
  }

  @Get('dashboard/branch-performance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranchPerformance(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.merchantsService.getBranchPerformance(currentUser);
    return createApiResponse(data, 'Branch performance retrieved successfully');
  }

  @Get('dashboard/offer-performance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getOfferPerformance(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.merchantsService.getOfferPerformance(currentUser);
    return createApiResponse(data, 'Offer performance retrieved successfully');
  }

  // ========== Bonus Settings Endpoints (Corporate & Admin) ==========

  @Get('branches/:branchId/bonus-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranchBonusSettings(
    @Param('branchId') branchId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.merchantsService.getBranchBonusSettings(branchId, currentUser);
    return createApiResponse(data, 'Bonus settings retrieved successfully');
  }

  @Put('branches/:branchId/bonus-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'UPDATE_BRANCH_BONUS_SETTINGS', tableName: 'branch_bonus_settings', recordIdParam: 'branchId' })
  async updateBranchBonusSettings(
    @Param('branchId') branchId: string,
    @Body() updateDto: UpdateBonusSettingsDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.merchantsService.updateBranchBonusSettings(branchId, updateDto, currentUser);
    return createApiResponse(data, 'Bonus settings updated successfully');
  }

  // ========== Branch Endpoints (Admin & Corporate) ==========

  @Get('branches/assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranchAssignments(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.merchantsService.getBranchAssignments(currentUser);
    return createApiResponse(data, 'Branch assignments retrieved successfully');
  }

  @Post('branches/:id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async assignOffersToBranch(
    @Param('id') id: string,
    @Body() assignDto: AssignOffersDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.merchantsService.assignOffersToBranch(id, assignDto, currentUser);
    return createApiResponse(data, 'Offers assigned successfully');
  }

  @Get('branches')
  // ... (rest of existing code)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranches(
    @CurrentUser() currentUser: ICurrentUser,
    @Query('corporateAccountId') corporateAccountId?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.merchantsService.getBranches(
      currentUser,
      corporateAccountId,
      search,
    );
    return createApiResponse(data, API_RESPONSE_MESSAGES.MERCHANT.BRANCH_LIST_SUCCESS);
  }

  @Get('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranchById(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.merchantsService.getBranchById(id, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.MERCHANT.BRANCH_GET_SUCCESS);
  }

  @Put('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'UPDATE_BRANCH', tableName: 'merchant_branches', recordIdParam: 'id' })
  async updateBranch(
    @Param('id') id: string,
    @Body() updateDto: UpdateBranchDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.merchantsService.updateBranch(id, updateDto, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.MERCHANT.BRANCH_UPDATE_SUCCESS);
  }

  @Delete('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'DELETE_BRANCH', tableName: 'merchant_branches', recordIdParam: 'id' })
  async deleteBranch(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    await this.merchantsService.deleteBranch(id, currentUser);
    return createApiResponse(null, API_RESPONSE_MESSAGES.MERCHANT.BRANCH_DELETE_SUCCESS);
  }

  @Put('branches/:id/approve-reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'APPROVE_REJECT_BRANCH', tableName: 'merchant_branches', recordIdParam: 'id' })
  async approveRejectBranch(
    @Param('id') id: string,
    @Body() approveRejectDto: ApproveRejectBranchDto,
  ) {
    const data = await this.merchantsService.approveRejectBranch(id, approveRejectDto.action);
    return createApiResponse(
      data,
      approveRejectDto.action === 'approved'
        ? API_RESPONSE_MESSAGES.MERCHANT.BRANCH_APPROVE_SUCCESS
        : API_RESPONSE_MESSAGES.MERCHANT.BRANCH_REJECT_SUCCESS,
    );
  }
}


