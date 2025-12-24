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

@Controller('admin/redemptions')
export class AdminRedemptionsController {
  constructor(private readonly redemptionsService: RedemptionsService) {}

  // ========== Branch Staff Endpoints ==========
  
  @Get('stats/daily')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getBranchDailyStats(@CurrentUser() currentUser: ICurrentUser) {
    console.log('getBranchDailyStats called by:', currentUser.id, currentUser.role);
    console.log('Branch:', currentUser.branch);
    return this.redemptionsService.getBranchDailyStats(currentUser);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.CREATED)
  async createRedemption(
    @Body() createDto: CreateRedemptionDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.redemptionsService.createRedemption(createDto, currentUser);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH, ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getRedemptions(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() queryDto: QueryRedemptionsDto,
  ) {
    if (currentUser.role === ROLES.ADMIN) {
      return this.redemptionsService.getAllRedemptions(queryDto);
    }
    return this.redemptionsService.getBranchRedemptions(
      currentUser,
      queryDto,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH, ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getRedemptionById(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    if (currentUser.role === ROLES.ADMIN) {
      return this.redemptionsService.getAdminRedemptionById(id);
    }
    return this.redemptionsService.getBranchRedemptionById(id, currentUser);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async rejectRedemption(
    @Param('id') id: string,
    @Body() updateDto: UpdateRedemptionDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.redemptionsService.rejectRedemption(
      id,
      updateDto,
      currentUser,
    );
  }
}

