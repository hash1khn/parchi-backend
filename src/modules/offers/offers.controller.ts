import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
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
import { QueryMerchantOffersDto } from './dto/query-merchant-offers.dto';
import { QueryActiveOffersDto } from './dto/query-active-offers.dto';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';
import { Audit } from '../../decorators/audit.decorator';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  // ========== Merchant Corporate Account Endpoints ==========

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE, ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'CREATE_OFFER', tableName: 'offers' })
  async createOffer(
    @Body() createDto: CreateOfferDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.createOffer(createDto, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.CREATE_SUCCESS, HttpStatus.CREATED);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getMerchantOffers(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() queryDto: QueryMerchantOffersDto,
  ) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const result = await this.offersService.getMerchantOffers(
      currentUser,
      queryDto.status,
      page,
      limit,
    );
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS,
    );
  }

  // ========== Student App Endpoints ==========

  @Get('active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getActiveOffers(
    @Query() queryDto: QueryActiveOffersDto,
  ) {
    const radius = queryDto.radius ?? 10;
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const result = await this.offersService.getActiveOffersForStudents(
      queryDto.category,
      queryDto.latitude,
      queryDto.longitude,
      radius,
      queryDto.sort,
      page,
      limit,
    );
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS,
    );
  }

  @Get('merchant/:merchantId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getOffersByMerchant(@Param('merchantId') merchantId: string) {
    const data = await this.offersService.getOffersByMerchantForStudents(merchantId);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS);
  }

  @Get(':id/details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getOfferDetails(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.offersService.getOfferDetailsForStudents(id);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.GET_SUCCESS);
  }

  // ========== Merchant Corporate Account Endpoints (continued) ==========

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE, ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getOfferById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.getOfferById(id, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.GET_SUCCESS);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'UPDATE_OFFER', tableName: 'offers', recordIdParam: 'id' })
  async updateOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateOfferDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.updateOffer(id, updateDto, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.UPDATE_SUCCESS);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'TOGGLE_OFFER_STATUS', tableName: 'offers', recordIdParam: 'id' })
  async toggleOfferStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.toggleOfferStatus(id, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.TOGGLE_SUCCESS);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'DELETE_OFFER', tableName: 'offers', recordIdParam: 'id' })
  async deleteOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.deleteOffer(id, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.DELETE_SUCCESS);
  }

  @Post(':id/branches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async assignBranchesToOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignDto: AssignBranchesDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.assignBranchesToOffer(id, assignDto, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.BRANCHES_ASSIGNED_SUCCESS);
  }

  @Delete(':id/branches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async removeBranchesFromOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignDto: AssignBranchesDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.removeBranchesFromOffer(
      id,
      assignDto,
      currentUser,
    );
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.BRANCHES_REMOVED_SUCCESS);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getOfferAnalytics(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.offersService.getOfferAnalytics(id, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.ANALYTICS_SUCCESS);
  }
}
