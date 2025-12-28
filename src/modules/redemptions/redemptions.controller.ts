import {
  Controller,
  Get,
  Param,
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
import { QueryRedemptionsDto } from './dto/query-redemptions.dto';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('redemptions')
export class RedemptionsController {
  constructor(private readonly redemptionsService: RedemptionsService) {}

  // ========== Student Endpoints (Read-Only) ==========

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getStudentRedemptions(
    @CurrentUser() currentUser: ICurrentUser,
    @Query() queryDto: QueryRedemptionsDto,
  ) {
    const result = await this.redemptionsService.getStudentRedemptions(
      currentUser,
      queryDto,
    );
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.REDEMPTION.LIST_SUCCESS,
    );
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getStudentRedemptionStats(
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.redemptionsService.getStudentRedemptionStats(currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.STATS_SUCCESS);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getRedemptionById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.redemptionsService.getRedemptionById(id, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS);
  }
}

