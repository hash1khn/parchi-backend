import {
  Controller,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { MerchantDigestService } from './merchant-digest.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { Audit } from '../../decorators/audit.decorator';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('admin/merchants/digest')
export class AdminMerchantDigestController {
  constructor(private readonly digestService: MerchantDigestService) {}

  /**
   * Run digests for all eligible merchants for previous month (or specified year/month).
   * Query: year, month, force, dryRun
   */
  @Post('run')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'RUN_MERCHANT_MONTH_DIGEST', tableName: 'merchant_monthly_digest_logs' })
  async runAll(
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
    @Query('force', new DefaultValuePipe(false), ParseBoolPipe) force?: boolean,
    @Query('dryRun', new DefaultValuePipe(false), ParseBoolPipe)
    dryRun?: boolean,
  ) {
    const year = yearStr ? Number(yearStr) : undefined;
    const month = monthStr ? Number(monthStr) : undefined;

    const data = await this.digestService.runForPeriod({
      year,
      month,
      force,
      dryRun,
    });

    return createApiResponse(data, 'Merchant month-end digest run completed');
  }

  /**
   * Send digest for a single merchant.
   * Query: year, month (required), force, dryRun
   */
  @Post(':merchantId/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'SEND_MERCHANT_MONTH_DIGEST',
    tableName: 'merchant_monthly_digest_logs',
    recordIdParam: 'merchantId',
  })
  async sendOne(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('force', new DefaultValuePipe(false), ParseBoolPipe) force?: boolean,
    @Query('dryRun', new DefaultValuePipe(false), ParseBoolPipe)
    dryRun?: boolean,
  ) {
    const data = await this.digestService.sendDigestForMerchant({
      merchantId,
      year,
      month,
      force,
      dryRun,
    });
    return createApiResponse(data, 'Merchant month-end digest processed');
  }
}
