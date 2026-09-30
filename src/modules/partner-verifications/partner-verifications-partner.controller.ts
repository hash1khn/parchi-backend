import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PartnerVerificationsService } from './partner-verifications.service';
import { CreatePartnerVerificationDto } from './dto/create-partner-verification.dto';
import { SkipThrottle } from '@nestjs/throttler';
import { PartnerApiKeyGuard } from '../../common/guards/partner-api-key.guard';
import { PartnerRateLimitGuard } from '../../common/guards/partner-rate-limit.guard';
import { CurrentPartner } from '../../decorators/current-partner.decorator';
import type { PartnerContext } from '../../decorators/current-partner.decorator';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('v1/partners/verification-requests')
// The IP-based global throttler is replaced by per-partner limits (PartnerRateLimitGuard)
// plus a failed-auth limiter inside PartnerApiKeyGuard.
@SkipThrottle({ global: true })
@UseGuards(PartnerApiKeyGuard, PartnerRateLimitGuard)
export class PartnerVerificationsPartnerController {
  constructor(private readonly partnerVerificationsService: PartnerVerificationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreatePartnerVerificationDto,
    @CurrentPartner() partner: PartnerContext,
  ) {
    const data = await this.partnerVerificationsService.createRequest(dto, partner);
    return createApiResponse(data, 'Verification request created');
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPartner() partner: PartnerContext,
  ) {
    const data = await this.partnerVerificationsService.getPartnerRequest(id, partner);
    return createApiResponse(data, 'Verification request fetched');
  }
}
