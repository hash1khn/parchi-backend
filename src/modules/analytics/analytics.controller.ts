import { Controller, Post, Body, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { LogEventDto } from './dto/log-event.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('log')

  async logEvent(@Req() req: any, @Body() logEventDto: LogEventDto) {
    const userId = req.user?.id || null;
    return this.analyticsService.logEvent(userId, logEventDto);
  }
}
