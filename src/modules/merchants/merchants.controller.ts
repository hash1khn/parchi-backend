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

// ... (existing imports)

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) { }

  // ========== Corporate Merchant Endpoints (Admin) ==========

  @Get('corporate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllCorporateMerchants(@Query('search') search?: string) {
    return this.merchantsService.getAllCorporateMerchants(search);
  }

  @Get('brands')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getAllBrands() {
    return this.merchantsService.getAllBrands();
  }

  @Get('corporate/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getCorporateAccountById(@Param('id') id: string) {
    return this.merchantsService.getCorporateAccountById(id);
  }

  @Put('corporate/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateCorporateAccount(
    @Param('id') id: string,
    @Body() updateDto: UpdateCorporateAccountDto,
  ) {
    return this.merchantsService.updateCorporateAccount(id, updateDto);
  }

  @Patch('corporate/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async toggleCorporateAccountStatus(@Param('id') id: string) {
    return this.merchantsService.toggleCorporateAccountStatus(id);
  }

  @Delete('corporate/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteCorporateAccount(@Param('id') id: string) {
    return this.merchantsService.deleteCorporateAccount(id);
  }

  // ========== Bonus Settings Endpoints (Corporate Only) ==========

  @Get('branches/:branchId/bonus-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranchBonusSettings(
    @Param('branchId') branchId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.merchantsService.getBranchBonusSettings(branchId, currentUser);
  }

  @Put('branches/:branchId/bonus-settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async updateBranchBonusSettings(
    @Param('branchId') branchId: string,
    @Body() updateDto: UpdateBonusSettingsDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.merchantsService.updateBranchBonusSettings(branchId, updateDto, currentUser);
  }

  // ========== Branch Endpoints (Admin & Corporate) ==========

  @Get('branches/assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranchAssignments(@CurrentUser() currentUser: ICurrentUser) {
    return this.merchantsService.getBranchAssignments(currentUser);
  }

  @Post('branches/:id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async assignOffersToBranch(
    @Param('id') id: string,
    @Body() assignDto: AssignOffersDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.merchantsService.assignOffersToBranch(id, assignDto, currentUser);
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
    return this.merchantsService.getBranches(
      currentUser,
      corporateAccountId,
      search,
    );
  }

  @Get('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getBranchById(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.merchantsService.getBranchById(id, currentUser);
  }

  @Put('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async updateBranch(
    @Param('id') id: string,
    @Body() updateDto: UpdateBranchDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.merchantsService.updateBranch(id, updateDto, currentUser);
  }

  @Delete('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async deleteBranch(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.merchantsService.deleteBranch(id, currentUser);
  }

  @Put('branches/:id/approve-reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approveRejectBranch(
    @Param('id') id: string,
    @Body() approveRejectDto: ApproveRejectBranchDto,
  ) {
    return this.merchantsService.approveRejectBranch(id, approveRejectDto.action);
  }
}


