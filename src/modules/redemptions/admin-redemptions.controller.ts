import {
  Controller,
  Get,
  Post,
  Patch,
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
import { RedemptionsService } from './redemptions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ROLES } from '../../constants/app.constants';
import { CreateRedemptionDto } from './dto/create-redemption.dto';
import { UpdateRedemptionDto } from './dto/update-redemption.dto';
import { QueryRedemptionsDto } from './dto/query-redemptions.dto';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';
import { Audit } from '../../decorators/audit.decorator';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('admin/redemptions')
export class AdminRedemptionsController {
  constructor(private readonly redemptionsService: RedemptionsService) {}

  // ========== Branch Staff Endpoints ==========
  
  @Get('stats/daily')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getBranchDailyStats(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.redemptionsService.getBranchDailyStats(currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS);
  }

  @Get('stats/daily-details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getBranchDailyRedemptionDetails(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.redemptionsService.getBranchDailyRedemptionDetails(currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS);
  }

  @Get('stats/aggregated')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getBranchAggregatedStats(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.redemptionsService.getBranchAggregatedStats(currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'CREATE_REDEMPTION', tableName: 'redemptions' })
  async createRedemption(
    @Body() createDto: CreateRedemptionDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.redemptionsService.createRedemption(createDto, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.CREATE_SUCCESS, HttpStatus.CREATED);
  }



  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH, ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getRedemptions(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() queryDto: QueryRedemptionsDto,
  ) {
    let result;
    if (currentUser.role === ROLES.ADMIN) {
      result = await this.redemptionsService.getAllRedemptions(queryDto);
    } else {
      result = await this.redemptionsService.getBranchRedemptions(
        currentUser,
        queryDto,
      );
    }
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.REDEMPTION.LIST_SUCCESS,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH, ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getRedemptionById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    let data;
    if (currentUser.role === ROLES.ADMIN) {
      data = await this.redemptionsService.getAdminRedemptionById(id);
    } else {
      data = await this.redemptionsService.getBranchRedemptionById(id, currentUser);
    }
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'REJECT_REDEMPTION', tableName: 'redemptions', recordIdParam: 'id' })
  async rejectRedemption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateRedemptionDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.redemptionsService.rejectRedemption(
      id,
      updateDto,
      currentUser,
    );
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.REJECT_SUCCESS);
  }
}

