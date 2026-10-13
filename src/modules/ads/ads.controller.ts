import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdsService } from './ads.service';
import { CreateAdDto } from './dto/create-ad.dto';
import { UpdateAdDto } from './dto/update-ad.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Get('active')
  @HttpCode(HttpStatus.OK)
  async findActive() {
    const data = await this.adsService.findActive();
    return createApiResponse(data, 'Active ads retrieved successfully');
  }
}

@Controller('admin/ads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class AdminAdsController {
  constructor(private readonly adsService: AdsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    const data = await this.adsService.findAll();
    return createApiResponse(data, 'Ads retrieved successfully');
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adsService.findOne(id);
    return createApiResponse(data, 'Ad retrieved successfully');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAdDto) {
    const data = await this.adsService.create(dto);
    return createApiResponse(data, 'Ad created successfully');
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdDto,
  ) {
    const data = await this.adsService.update(id, dto);
    return createApiResponse(data, 'Ad updated successfully');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adsService.remove(id);
    return createApiResponse(data, 'Ad deleted successfully');
  }
}
