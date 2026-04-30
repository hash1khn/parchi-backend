import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogEventDto } from './dto/log-event.dto';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async logEvent(userId: string | null, dto: LogEventDto) {
    return this.prisma.analytics_events.create({
      data: {
        user_id: userId,
        event_name: dto.eventName,
        platform: dto.platform,
        metadata: dto.metadata || {},
      },
    });
  }

  async getFunnelStats(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = startDate;
      if (endDate) where.created_at.lte = endDate;
    }

    // Define funnel steps mapping: { displayName: eventName }
    const funnelSteps = [
      { label: 'App Opened', event: 'app_opened' },
      { label: 'Signup Started', event: 'signup_step_1_start' },
      { label: 'Signup Completed', event: 'signup_step_2_complete' },
      { label: 'Kyc Submitted', event: 'kyc_submitted' },
      { label: 'Account Verified', event: 'signup_verification_verified' },
      { label: 'First Redemption', event: 'first_redemption' },

    ];

    const stats = await Promise.all(
      funnelSteps.map(async (step) => {
        const count = await this.prisma.analytics_events.count({
          where: {
            ...where,
            event_name: step.event,
          },
        });
        return { step: step.label, count };
      }),
    );

    return stats;

  }

  async getOnboardingDropoff(startDate?: Date, endDate?: Date) {
    const steps = [
      'signup_step_1_start',
      'signup_step_1_complete',
      'signup_step_2_start',
      'signup_step_2_complete',
      'signup_verification_sent',
      'signup_verification_verified',
    ];

    const where: any = {};
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = startDate;
      if (endDate) where.created_at.lte = endDate;
    }

    const stats = await Promise.all(
      steps.map(async (step) => {
        const count = await this.prisma.analytics_events.count({
          where: {
            ...where,
            event_name: step,
          },
        });
        return { step, count };
      }),
    );

    return stats;
  }

  async getPlatformDistribution(startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = startDate;
      if (endDate) where.created_at.lte = endDate;
    }

    const distribution = await this.prisma.analytics_events.groupBy({
      by: ['platform'],
      where: {
        ...where,
        event_name: 'app_opened',
      },
      _count: {
        platform: true,
      },
    });

    return distribution.map((item) => ({
      platform: item.platform || 'Unknown',
      count: item._count.platform,
    }));
  }
}
