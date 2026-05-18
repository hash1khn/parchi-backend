import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QrRedemptionsService } from './qr-redemptions.service';
import { InitiateQrRedemptionDto } from './dto/initiate-qr-redemption.dto';
import { RejectQrRedemptionDto } from './dto/reject-qr-redemption.dto';
import { UpdateQrSettingsDto } from './dto/update-qr-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';

@Controller('qr-redemptions')
export class QrRedemptionsController {
  constructor(private readonly qrRedemptionsService: QrRedemptionsService) {}

  // ── Public ────────────────────────────────────────────────────────────────

  @Get('branch/:branchId/offers')
  @HttpCode(HttpStatus.OK)
  async getBranchOffers(@Param('branchId', ParseUUIDPipe) branchId: string) {
    const data = await this.qrRedemptionsService.getBranchOffers(branchId);
    return createApiResponse(data, 'Branch offers fetched successfully');
  }

  // ── Student ───────────────────────────────────────────────────────────────

  @Post('initiate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.CREATED)
  async initiateRequest(
    @Body() dto: InitiateQrRedemptionDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.qrRedemptionsService.initiateRequest(dto, currentUser);
    return createApiResponse(data, 'QR redemption request initiated');
  }

  @Get('status/:requestId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getRequestStatus(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.qrRedemptionsService.getRequestStatus(requestId, currentUser);
    return createApiResponse(data, 'Request status fetched');
  }

  @Delete(':requestId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async cancelRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.qrRedemptionsService.cancelRequest(requestId, currentUser);
    return createApiResponse(data, 'Request cancelled');
  }

  // ── Branch ────────────────────────────────────────────────────────────────

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getPendingRequests(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.qrRedemptionsService.getPendingRequests(currentUser);
    return createApiResponse(data, 'Pending QR requests fetched');
  }

  @Patch(':requestId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async approveRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.qrRedemptionsService.approveRequest(requestId, currentUser);
    return createApiResponse(data, 'Request approved');
  }

  @Patch(':requestId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async rejectRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RejectQrRedemptionDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.qrRedemptionsService.rejectRequest(requestId, dto, currentUser);
    return createApiResponse(data, 'Request rejected');
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getQrSettings(@CurrentUser() currentUser: ICurrentUser) {
    const data = await this.qrRedemptionsService.getQrSettings(currentUser);
    return createApiResponse(data, 'QR settings fetched');
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async updateQrSettings(
    @Body() dto: UpdateQrSettingsDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.qrRedemptionsService.updateQrSettings(dto, currentUser);
    return createApiResponse(data, 'QR settings updated');
  }
}
