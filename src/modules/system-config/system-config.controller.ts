import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('admin/config')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  /**
   * Public endpoint — no auth required.
   * Returns only the fields the mobile app needs for force-update / maintenance checks.
   */
  @Get('app')
  @HttpCode(HttpStatus.OK)
  async getAppConfig() {
    const config = await this.systemConfigService.getConfig();
    return createApiResponse({
      minAndroidVersion: config.min_android_version,
      minIosVersion: config.min_ios_version,
      isUnderMaintenance: config.is_under_maintenance,
      forceUpdateTitle: config.force_update_title,
      forceUpdateMessage: config.force_update_message,
    }, 'App configuration retrieved successfully');
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getConfig() {
    const data = await this.systemConfigService.getConfig();
    return createApiResponse(data, 'System configuration retrieved successfully');
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateConfig(@Body() updateConfigDto: UpdateConfigDto) {
    const data = await this.systemConfigService.updateConfig(updateConfigDto);
    return createApiResponse(data, 'System configuration updated successfully');
  }
}
