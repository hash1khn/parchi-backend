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
    const students = await this.fetchStudentsForPlatformStats(startDate, endDate);
    const resolved = await this.resolvePlatformsForStudents(students);

    let ios = 0;
    let android = 0;
    let unknown = 0;

    for (const student of students) {
      const platform = resolved.get(student.id);
      if (platform === 'ios') ios += 1;
      else if (platform === 'android') android += 1;
      else unknown += 1;
    }

    const results: { platform: string; count: number }[] = [];
    if (ios > 0) results.push({ platform: 'ios', count: ios });
    if (android > 0) results.push({ platform: 'android', count: android });
    if (unknown > 0) results.push({ platform: 'unknown', count: unknown });
    return results;
  }

  async getDailyPlatformDistribution(startDate?: Date, endDate?: Date) {
    const students = await this.fetchStudentsForPlatformStats(startDate, endDate);
    const resolved = await this.resolvePlatformsForStudents(students);

    const dateMap = new Map<string, { ios: number; android: number }>();

    for (const student of students) {
      if (!student.created_at) continue;
      const platform = resolved.get(student.id);
      if (!platform) continue;

      const dateStr = student.created_at.toISOString().split('T')[0];
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { ios: 0, android: 0 });
      }

      const counts = dateMap.get(dateStr)!;
      if (platform === 'ios') counts.ios += 1;
      else counts.android += 1;
    }

    return Array.from(dateMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async fetchStudentsForPlatformStats(startDate?: Date, endDate?: Date) {
    const where: { created_at: { not: null; gte?: Date; lte?: Date } } = {
      created_at: { not: null },
    };
    if (startDate) where.created_at.gte = startDate;
    if (endDate) where.created_at.lte = endDate;

    return this.prisma.students.findMany({
      where,
      select: {
        id: true,
        user_id: true,
        created_at: true,
        platform: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Resolve ios/android for charting without mutating students.platform.
   * Priority: stored students.platform → earliest FCM device → signup-time analytics.
   * user_fcm_tokens keeps every device; this only picks the first registered device for attribution.
   */
  private async resolvePlatformsForStudents(
    students: { id: string; user_id: string; created_at: Date | null; platform: string | null }[],
  ): Promise<Map<string, 'ios' | 'android'>> {
    const resolved = new Map<string, 'ios' | 'android'>();
    const needsInference: typeof students = [];

    for (const student of students) {
      const stored = this.normalizeChartPlatform(student.platform);
      if (stored) {
        resolved.set(student.id, stored);
      } else {
        needsInference.push(student);
      }
    }

    if (needsInference.length === 0) return resolved;

    const userIds = needsInference.map((s) => s.user_id);
    const signupTimeByUser = new Map(
      needsInference.map((s) => [s.user_id, s.created_at?.getTime() ?? 0]),
    );

    const fcmTokens = await this.prisma.user_fcm_tokens.findMany({
      where: {
        user_id: { in: userIds },
        platform: { not: null, notIn: ['unknown', 'undefined', ''] },
      },
      orderBy: { created_at: 'asc' },
      select: { user_id: true, platform: true },
    });

    const earliestFcmByUser = new Map<string, string>();
    for (const token of fcmTokens) {
      if (!earliestFcmByUser.has(token.user_id) && token.platform) {
        earliestFcmByUser.set(token.user_id, token.platform);
      }
    }

    const remainingUserIds = userIds.filter((id) => !earliestFcmByUser.has(id));
    const analyticsByUser = new Map<string, string>();

    if (remainingUserIds.length > 0) {
      const events = await this.prisma.analytics_events.findMany({
        where: {
          user_id: { in: remainingUserIds },
          platform: { not: null, notIn: ['unknown', 'undefined', ''] },
          event_name: {
            in: [
              'app_opened',
              'signup_step_1_start',
              'signup_step_1_complete',
              'signup_step_2_start',
              'signup_step_2_complete',
              'kyc_submitted',
            ],
          },
        },
        select: { user_id: true, platform: true, created_at: true },
      });

      for (const userId of remainingUserIds) {
        const signupTime = signupTimeByUser.get(userId) ?? 0;
        if (!signupTime) continue;

        let closestPlatform: string | null = null;
        let minDiff = Infinity;

        for (const event of events) {
          if (event.user_id !== userId || !event.created_at || !event.platform) continue;
          const diff = Math.abs(event.created_at.getTime() - signupTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPlatform = event.platform;
          }
        }

        if (closestPlatform && minDiff < 5 * 60 * 1000) {
          analyticsByUser.set(userId, closestPlatform);
        }
      }
    }

    for (const student of needsInference) {
      const fromFcm = this.normalizeChartPlatform(
        earliestFcmByUser.get(student.user_id) ?? null,
      );
      if (fromFcm) {
        resolved.set(student.id, fromFcm);
        continue;
      }

      const fromAnalytics = this.normalizeChartPlatform(
        analyticsByUser.get(student.user_id) ?? null,
      );
      if (fromAnalytics) {
        resolved.set(student.id, fromAnalytics);
      }
    }

    return resolved;
  }

  private normalizeChartPlatform(
    platform: string | null | undefined,
  ): 'ios' | 'android' | null {
    if (!platform) return null;
    const normalized = platform.trim().toLowerCase();
    if (normalized === 'ios') return 'ios';
    if (normalized === 'android') return 'android';
    return null;
  }
}
