import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PartnerVerificationsService } from './partner-verifications.service';
import { CreatePartnerDiscountRedemptionDto } from './dto/create-partner-discount-redemption.dto';
import { PartnerApiKeyGuard } from '../../common/guards/partner-api-key.guard';
import { PartnerRateLimitGuard } from '../../common/guards/partner-rate-limit.guard';
import { CurrentPartner } from '../../decorators/current-partner.decorator';
import type { PartnerContext } from '../../decorators/current-partner.decorator';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('v1/partners/discount-redemptions')
@SkipThrottle({ global: true })
@UseGuards(PartnerApiKeyGuard, PartnerRateLimitGuard)
export class PartnerDiscountRedemptionsController {
  constructor(private readonly partnerVerificationsService: PartnerVerificationsService) {}

  @Post()
  async record(
    @Body() dto: CreatePartnerDiscountRedemptionDto,
    @CurrentPartner() partner: PartnerContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, created } = await this.partnerVerificationsService.recordDiscountRedemption(
      dto,
      partner,
    );
    const status = created ? HttpStatus.CREATED : HttpStatus.OK;
    res.status(status);
    return createApiResponse(
      data,
      created ? 'Discount redemption recorded' : 'Discount redemption already recorded',
      status,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPartner() partner: PartnerContext,
  ) {
    const data = await this.partnerVerificationsService.getDiscountRedemption(id, partner);
    return createApiResponse(data, 'Discount redemption fetched');
  }
}
