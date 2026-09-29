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
import { SkipThrottle } from '@nestjs/throttler';
import { ApprovePartnerVerificationDto } from './dto/approve-partner-verification.dto';
import { StudentRateLimitGuard } from '../../common/guards/student-rate-limit.guard';
import { RejectPartnerVerificationDto } from './dto/reject-partner-verification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';

@Controller('verification-requests')
// Per-user limits (StudentRateLimitGuard) replace the IP-based global throttler so
// students behind a shared campus NAT do not exhaust one bucket.
@SkipThrottle({ global: true })
@UseGuards(JwtAuthGuard, RolesGuard, StudentRateLimitGuard)
@Roles(ROLES.STUDENT)
export class PartnerVerificationsStudentController {
  constructor(private readonly partnerVerificationsService: PartnerVerificationsService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.partnerVerificationsService.getStudentRequest(id, currentUser);
    return createApiResponse(data, 'Verification request fetched');
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovePartnerVerificationDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.partnerVerificationsService.approveRequest(id, currentUser, dto);
    return createApiResponse(data, 'Verification approved');
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPartnerVerificationDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.partnerVerificationsService.rejectRequest(
      id,
      currentUser,
      dto.rejectionReason,
    );
    return createApiResponse(data, 'Verification rejected');
  }
}
