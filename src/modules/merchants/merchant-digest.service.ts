import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MerchantDigestPdfService } from './merchant-digest-pdf.service';
import { MerchantDigestPayload } from './merchant-digest.types';
import {
  pakistanCalendarMonthRange,
  previousPakistanCalendarMonthRange,
} from '../../utils/pakistan-time.util';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1500;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type DigestSendResult = {
  merchantId: string;
  businessName: string;
  status: 'sent' | 'failed' | 'skipped' | 'dry_run';
  redemptionCount: number;
  recipientEmail?: string;
  error?: string;
};

@Injectable()
export class MerchantDigestService {
  private readonly logger = new Logger(MerchantDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly pdfService: MerchantDigestPdfService,
    private readonly configService: ConfigService,
  ) {}

  periodLabel(year: number, month: number): string {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  async buildDigestByMerchantId(
    merchantId: string,
    year: number,
    month: number,
  ): Promise<MerchantDigestPayload> {
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        business_name: true,
        contact_email: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const { start, end } = pakistanCalendarMonthRange(year, month);

    const branches = await this.prisma.merchant_branches.findMany({
      where: { merchant_id: merchantId },
      select: { id: true, branch_name: true },
    });
    const branchIds = branches.map((b) => b.id);

    const redemptions =
      branchIds.length === 0
        ? []
        : await this.prisma.redemptions.findMany({
            where: {
              branch_id: { in: branchIds },
              created_at: { gte: start, lte: end },
            },
            include: {
              merchant_branches: { select: { branch_name: true } },
              offers: {
                select: {
                  title: true,
                  discount_value: true,
                  discount_type: true,
                },
              },
              students: {
                select: {
                  parchi_id: true,
                  university: true,
                },
              },
            },
            orderBy: { created_at: 'desc' },
          });

    const uniqueStudentIds = new Set<string>();
    let totalDiscountGiven = 0;
    const branchMap = new Map<string, number>();
    const offerMap = new Map<
      string,
      {
        title: string;
        count: number;
        discountType: string;
        discountValue: number;
      }
    >();

    for (const r of redemptions) {
      uniqueStudentIds.add(r.student_id);
      const offerDiscount = Number(r.offers.discount_value);
      const bonusDiscount = r.bonus_discount_applied
        ? Number(r.bonus_discount_applied)
        : 0;
      totalDiscountGiven += offerDiscount + bonusDiscount;

      const branchName = r.merchant_branches.branch_name;
      branchMap.set(branchName, (branchMap.get(branchName) ?? 0) + 1);

      const offerKey = r.offer_id;
      const existing = offerMap.get(offerKey);
      if (existing) {
        existing.count += 1;
      } else {
        offerMap.set(offerKey, {
          title: r.offers.title,
          count: 1,
          discountType: r.offers.discount_type,
          discountValue: Number(r.offers.discount_value),
        });
      }
    }

    const totalRedemptions = redemptions.length;
    const avgDiscountPerOrder =
      totalRedemptions > 0
        ? Math.round(totalDiscountGiven / totalRedemptions)
        : 0;

    const branchBreakdown = Array.from(branchMap.entries())
      .map(([branchName, totalRedemptions]) => ({
        branchName,
        totalRedemptions,
      }))
      .sort((a, b) => b.totalRedemptions - a.totalRedemptions);

    const topOffers = Array.from(offerMap.values())
      .map((o) => ({
        offerTitle: o.title,
        totalRedemptions: o.count,
        discountType: o.discountType,
        discountValue: o.discountValue,
      }))
      .sort((a, b) => b.totalRedemptions - a.totalRedemptions)
      .slice(0, 5);

    return {
      merchantId: merchant.id,
      businessName: merchant.business_name,
      contactEmail: merchant.contact_email,
      periodYear: year,
      periodMonth: month,
      periodLabel: this.periodLabel(year, month),
      summary: {
        totalRedemptions,
        uniqueStudents: uniqueStudentIds.size,
        totalDiscountGiven,
        avgDiscountPerOrder,
      },
      branchBreakdown,
      topOffers,
      redemptions: redemptions.map((r) => ({
        id: r.id,
        date: r.created_at ?? new Date(),
        branchName: r.merchant_branches.branch_name,
        offerTitle: r.offers.title,
        parchiId: r.students?.parchi_id || 'Unknown',
        university: r.students?.university ?? null,
        bonusDiscountApplied: r.bonus_discount_applied
          ? Number(r.bonus_discount_applied)
          : 0,
      })),
    };
  }

  async listEligibleMerchants() {
    return this.prisma.merchants.findMany({
      where: {
        is_active: true,
        verification_status: 'approved',
      },
      select: {
        id: true,
        business_name: true,
        contact_email: true,
      },
      orderBy: { business_name: 'asc' },
    });
  }

  /**
   * Send digest for one merchant. Idempotent unless force=true.
   */
  async sendDigestForMerchant(params: {
    merchantId: string;
    year: number;
    month: number;
    force?: boolean;
    dryRun?: boolean;
  }): Promise<DigestSendResult> {
    const { merchantId, year, month, force = false, dryRun = false } = params;

    if (month < 1 || month > 12) {
      throw new BadRequestException('month must be 1ù12');
    }

    const existing = await this.prisma.merchant_monthly_digest_logs.findUnique({
      where: {
        merchant_id_period_year_period_month: {
          merchant_id: merchantId,
          period_year: year,
          period_month: month,
        },
      },
    });

    if (existing?.status === 'sent' && !force) {
      const merchant = await this.prisma.merchants.findUnique({
        where: { id: merchantId },
        select: { business_name: true },
      });
      return {
        merchantId,
        businessName: merchant?.business_name ?? merchantId,
        status: 'skipped',
        redemptionCount: existing.redemption_count,
        recipientEmail: existing.recipient_email ?? undefined,
      };
    }

    const digest = await this.buildDigestByMerchantId(merchantId, year, month);
    const pdfFileName = `Parchi_Month_End_Digest_${year}-${String(month).padStart(2, '0')}.pdf`;

    if (dryRun) {
      this.logger.log(
        `[dry-run] Would send digest to ${digest.contactEmail} for ${digest.businessName} (${digest.periodLabel}, ${digest.summary.totalRedemptions} redemptions)`,
      );
      return {
        merchantId,
        businessName: digest.businessName,
        status: 'dry_run',
        redemptionCount: digest.summary.totalRedemptions,
        recipientEmail: digest.contactEmail,
      };
    }

    try {
      const pdfBuffer = await this.pdfService.generate(digest);
      const dashboardUrl = this.configService.get<string>(
        'MERCHANT_DASHBOARD_URL',
      );

      const ok = await this.mailService.sendMerchantMonthEndDigestEmail({
        to: digest.contactEmail,
        businessName: digest.businessName,
        periodLabel: digest.periodLabel,
        totalRedemptions: digest.summary.totalRedemptions,
        uniqueStudents: digest.summary.uniqueStudents,
        totalDiscountGiven: digest.summary.totalDiscountGiven,
        avgDiscountPerOrder: digest.summary.avgDiscountPerOrder,
        branchRows: digest.branchBreakdown,
        topOffers: digest.topOffers,
        pdfBuffer,
        pdfFileName,
        dashboardUrl: dashboardUrl || undefined,
      });

      if (!ok) {
        await this.upsertLog({
          merchantId,
          year,
          month,
          status: 'failed',
          recipientEmail: digest.contactEmail,
          redemptionCount: digest.summary.totalRedemptions,
          errorMessage: 'Brevo send returned false',
        });
        return {
          merchantId,
          businessName: digest.businessName,
          status: 'failed',
          redemptionCount: digest.summary.totalRedemptions,
          recipientEmail: digest.contactEmail,
          error: 'Brevo send returned false',
        };
      }

      await this.upsertLog({
        merchantId,
        year,
        month,
        status: 'sent',
        recipientEmail: digest.contactEmail,
        redemptionCount: digest.summary.totalRedemptions,
      });

      return {
        merchantId,
        businessName: digest.businessName,
        status: 'sent',
        redemptionCount: digest.summary.totalRedemptions,
        recipientEmail: digest.contactEmail,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed digest for merchant ${merchantId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.upsertLog({
        merchantId,
        year,
        month,
        status: 'failed',
        recipientEmail: digest.contactEmail,
        redemptionCount: digest.summary.totalRedemptions,
        errorMessage: message,
      });
      return {
        merchantId,
        businessName: digest.businessName,
        status: 'failed',
        redemptionCount: digest.summary.totalRedemptions,
        recipientEmail: digest.contactEmail,
        error: message,
      };
    }
  }

  /**
   * Run digests for all eligible merchants for a given period (or previous month).
   */
  async runForPeriod(options?: {
    year?: number;
    month?: number;
    force?: boolean;
    dryRun?: boolean;
  }): Promise<{
    year: number;
    month: number;
    results: DigestSendResult[];
  }> {
    let year: number;
    let month: number;

    if (options?.year != null && options?.month != null) {
      year = options.year;
      month = options.month;
    } else {
      const prev = previousPakistanCalendarMonthRange(new Date());
      year = prev.year;
      month = prev.month;
    }

    const dryRun =
      options?.dryRun === true ||
      this.configService.get<string>('MERCHANT_DIGEST_DRY_RUN') === 'true';

    const merchants = await this.listEligibleMerchants();
    this.logger.log(
      `Month-end digest ${year}-${month}: ${merchants.length} eligible merchants (dryRun=${dryRun})`,
    );

    const results: DigestSendResult[] = [];

    for (let i = 0; i < merchants.length; i += BATCH_SIZE) {
      const batch = merchants.slice(i, i + BATCH_SIZE);
      for (const m of batch) {
        const result = await this.sendDigestForMerchant({
          merchantId: m.id,
          year,
          month,
          force: options?.force,
          dryRun,
        });
        results.push(result);
        this.logger.log(
          `Digest ${result.status}: ${m.business_name} (${result.redemptionCount} redemptions) ? ${result.recipientEmail ?? m.contact_email}`,
        );
      }
      if (i + BATCH_SIZE < merchants.length && !dryRun) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    return { year, month, results };
  }

  private async upsertLog(params: {
    merchantId: string;
    year: number;
    month: number;
    status: 'sent' | 'failed' | 'skipped';
    recipientEmail: string;
    redemptionCount: number;
    errorMessage?: string;
  }) {
    const {
      merchantId,
      year,
      month,
      status,
      recipientEmail,
      redemptionCount,
      errorMessage,
    } = params;

    await this.prisma.merchant_monthly_digest_logs.upsert({
      where: {
        merchant_id_period_year_period_month: {
          merchant_id: merchantId,
          period_year: year,
          period_month: month,
        },
      },
      create: {
        merchant_id: merchantId,
        period_year: year,
        period_month: month,
        status,
        recipient_email: recipientEmail,
        redemption_count: redemptionCount,
        error_message: errorMessage ?? null,
        sent_at: status === 'sent' ? new Date() : null,
      },
      update: {
        status,
        recipient_email: recipientEmail,
        redemption_count: redemptionCount,
        error_message: errorMessage ?? null,
        sent_at: status === 'sent' ? new Date() : null,
      },
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
