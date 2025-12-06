import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { OffersService } from './offers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ROLES } from '../../constants/app.constants';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { AssignBranchesDto } from './dto/assign-branches.dto';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';

@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  // ========== Merchant Corporate Account Endpoints ==========

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.CREATED)
  async createOffer(
    @Body() createDto: CreateOfferDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.offersService.createOffer(createDto, currentUser);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getMerchantOffers(
    @CurrentUser() currentUser: ICurrentUser,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.offersService.getMerchantOffers(
      currentUser,
      status,
      page,
      limit,
    );
  }

  // ========== Student App Endpoints ==========

  @Get('active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getActiveOffers(
    @Query('category') category?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('radius', new DefaultValuePipe(10), ParseIntPipe) radius?: number,
    @Query('sort') sort?: 'popularity' | 'proximity' | 'newest',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.offersService.getActiveOffersForStudents(
      category,
      latitude ? parseFloat(latitude) : undefined,
      longitude ? parseFloat(longitude) : undefined,
      radius,
      sort,
      page,
      limit,
    );
  }

  @Get('merchant/:merchantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getOffersByMerchant(@Param('merchantId') merchantId: string) {
    return this.offersService.getOffersByMerchantForStudents(merchantId);
  }

  @Get(':id/details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getOfferDetails(@Param('id') id: string) {
    return this.offersService.getOfferDetailsForStudents(id);
  }

  // ========== Merchant Corporate Account Endpoints (continued) ==========

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE, ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getOfferById(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.offersService.getOfferById(id, currentUser);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async updateOffer(
    @Param('id') id: string,
    @Body() updateDto: UpdateOfferDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.offersService.updateOffer(id, updateDto, currentUser);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async deleteOffer(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.offersService.deleteOffer(id, currentUser);
  }

  @Post(':id/branches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async assignBranchesToOffer(
    @Param('id') id: string,
    @Body() assignDto: AssignBranchesDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.offersService.assignBranchesToOffer(id, assignDto, currentUser);
  }

  @Delete(':id/branches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async removeBranchesFromOffer(
    @Param('id') id: string,
    @Body() assignDto: AssignBranchesDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.offersService.removeBranchesFromOffer(
      id,
      assignDto,
      currentUser,
    );
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getOfferAnalytics(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.offersService.getOfferAnalytics(id, currentUser);
  }
}
