import {
  Controller,
  Get,
  Param,
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
import { QueryRedemptionsDto } from './dto/query-redemptions.dto';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';

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
    return this.redemptionsService.getStudentRedemptions(
      currentUser,
      queryDto,
    );
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getStudentRedemptionStats(
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.redemptionsService.getStudentRedemptionStats(currentUser);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getRedemptionById(
    @Param('id') id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.redemptionsService.getRedemptionById(id, currentUser);
  }
}

