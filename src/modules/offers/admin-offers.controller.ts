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
    return this.offersService.getAllOffers(
      queryDto.status,
      queryDto.merchantId,
      page,
      limit,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getOfferByIdAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.offersService.getOfferByIdAdmin(id);
  }

  @Put(':id/approve-reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approveRejectOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveRejectDto: ApproveRejectOfferDto,
  ) {
    return this.offersService.approveRejectOffer(id, approveRejectDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteOfferAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.offersService.deleteOfferAdmin(id);
  }
}

