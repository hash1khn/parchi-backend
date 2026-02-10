import {
  Controller,
  Get,
  Put,
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
import { ROLES } from '../../constants/app.constants';
import { ApproveRejectOfferDto } from './dto/approve-reject-offer.dto';
import { QueryAdminOffersDto } from './dto/query-admin-offers.dto';
import { Audit } from '../../decorators/audit.decorator';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('admin/offers')
export class AdminOffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllOffers(
    @Query() queryDto: QueryAdminOffersDto,
  ) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const result = await this.offersService.getAllOffers(
      queryDto.status,
      queryDto.merchantId,
      page,
      limit,
      queryDto.search,
    );
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getOfferByIdAdmin(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.offersService.getOfferByIdAdmin(id);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.GET_SUCCESS);
  }

  @Put(':id/approve-reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'APPROVE_REJECT_OFFER', tableName: 'offers', recordIdParam: 'id' })
  async approveRejectOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveRejectDto: ApproveRejectOfferDto,
  ) {
    const data = await this.offersService.approveRejectOffer(id, approveRejectDto);
    return createApiResponse(
      data,
      approveRejectDto.action === 'approve'
        ? API_RESPONSE_MESSAGES.OFFER.APPROVE_SUCCESS
        : API_RESPONSE_MESSAGES.OFFER.REJECT_SUCCESS,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'DELETE_OFFER_ADMIN', tableName: 'offers', recordIdParam: 'id' })
  async deleteOfferAdmin(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.offersService.deleteOfferAdmin(id);
    return createApiResponse(data, API_RESPONSE_MESSAGES.OFFER.DELETE_SUCCESS);
  }
}

