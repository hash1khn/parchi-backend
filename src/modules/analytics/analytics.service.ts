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
      { label: 'Student Info Started', event: 'signup_step_1_start' },
      { label: 'Student Info Complete', event: 'signup_step_1_complete' },
      { label: 'Document Upload Complete', event: 'signup_step_2_complete' },
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

  /**
   * @deprecated Signup dropoff KPI uses GET /admin/dashboard/signup-funnel (DB-state).
   * Kept for reference; no longer returned from dashboard stats.
   */
  async getOnboardingDropoff(startDate?: Date, endDate?: Date) {
    const steps = [
      { label: 'Student Info Start', event: 'signup_step_1_start' },
      { label: 'Student Info Complete', event: 'signup_step_1_complete' },
      { label: 'Document Upload Start', event: 'signup_step_2_start' },
      { label: 'Document Upload Complete', event: 'signup_step_2_complete' },
      { label: 'Verification Sent', event: 'signup_verification_sent' },
      { label: 'Verification Verified', event: 'signup_verification_verified' },
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
            event_name: step.event,
          },
        });
        return { step: step.label, count };
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

    const distribution = await this.prisma.students.groupBy({
      by: ['platform'],
      where,
      _count: {
        id: true,
      },
    });

    const platformMap = new Map<string, number>();
    distribution.forEach((item) => {
      const platform = (item.platform || 'unknown').toLowerCase();
      platformMap.set(platform, (platformMap.get(platform) || 0) + item._count.id);
    });

    return Array.from(platformMap.entries()).map(([platform, count]) => ({
      platform,
      count,
    }));
  }

  async getDailyPlatformDistribution(startDate?: Date, endDate?: Date) {
    const where: any = {
      created_at: {
        not: null,
      },
    };
    if (startDate || endDate) {
      if (startDate) where.created_at.gte = startDate;
      if (endDate) where.created_at.lte = endDate;
    }

    const distribution = await this.prisma.students.groupBy({
      by: ['created_at', 'platform'],
      where,
      _count: {
        id: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    // Group by date
    const dailyData: { date: string; ios: number; android: number }[] = [];
    const dateMap = new Map<string, { ios: number; android: number }>();

    distribution.forEach((item) => {
      if (!item.created_at) return;
      const dateStr = item.created_at.toISOString().split('T')[0];
      const platform = (item.platform || 'unknown').toLowerCase();
      
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { ios: 0, android: 0 });
      }
      
      const counts = dateMap.get(dateStr)!;
      if (platform === 'ios') counts.ios += item._count.id;
      else if (platform === 'android') counts.android += item._count.id;
    });

    dateMap.forEach((counts, date) => {
      dailyData.push({ date, ...counts });
    });

    return dailyData.sort((a, b) => a.date.localeCompare(b.date));
  }
}
