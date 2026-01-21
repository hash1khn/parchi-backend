import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  async sendBroadcast(@Body() createBroadcastDto: CreateBroadcastDto) {
    const result = await this.notificationsService.sendBroadcastNotification(createBroadcastDto);
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
  async sendFromQueue(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.notificationsService.sendFromQueue(id);
    return createApiResponse(result, 'Notification sent from queue successfully');
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  async getHistory(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.notificationsService.getNotificationHistory(
      Number(page),
      Number(limit),
    );
    return createApiResponse(result, 'Notification history fetched successfully');
  }
}
