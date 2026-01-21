import { Controller, Get, Post, Param, Query, UseGuards, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('student/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.STUDENT)
export class StudentNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getNotifications(
    @CurrentUser() user: ICurrentUser,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.notificationsService.getStudentNotifications(
      user.id,
      Number(page),
      Number(limit),
    );
    return createApiResponse(result, 'Notifications fetched successfully');
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ICurrentUser,
  ) {
    const result = await this.notificationsService.markAsRead(user.id, id);
    return createApiResponse(result, 'Notification marked as read');
  }
}
