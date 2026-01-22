import { Controller, Post, Param, UseGuards, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { createApiResponse } from '../../utils/serializer.util';
import { UserRole } from '../../types/global.types';

interface ICurrentUser {
  id: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class UserNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
