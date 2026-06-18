import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  async sendBroadcast(
    @Body() createBroadcastDto: CreateBroadcastDto,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const result = await this.notificationsService.sendBroadcastNotification(createBroadcastDto, currentUser);
    return createApiResponse(result, 'Broadcast notification sent successfully');
  }

  @Get('queue')
  @HttpCode(HttpStatus.OK)
  async getQueue(@Query('status') status?: string) {
    const result = await this.notificationsService.getNotificationQueue(status);
    return createApiResponse(result, 'Notification queue fetched successfully');
  }

  @Post('queue/:id/send')
  @HttpCode(HttpStatus.OK)
  async sendFromQueue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const result = await this.notificationsService.sendFromQueue(id, currentUser);
    return createApiResponse(result, 'Notification sent from queue successfully');
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  async getHistory(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('type') type?: string,
  ) {
    const result = await this.notificationsService.getNotificationHistory(
      Number(page),
      Number(limit),
      type,
    );
    return createApiResponse(result, 'Notification history fetched successfully');
  }

  @Get('estimate')
  @HttpCode(HttpStatus.OK)
  async getEstimate(
    @Query('targetType') targetType: string = 'all',
    @Query('targetValue') targetValue?: string,
  ) {
    const result = await this.notificationsService.getRecipientEstimate(targetType, targetValue);
    return createApiResponse(result, 'Recipient estimate fetched successfully');
  }

  @Get('targets')
  @HttpCode(HttpStatus.OK)
  async getTargets() {
    const result = await this.notificationsService.getTargetGroups();
    return createApiResponse(result, 'Target groups fetched successfully');
  }
}
