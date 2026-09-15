/**
 * One-off: send month-end digest for a merchant to a test recipient.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scratch/send_test_merchant_digest.ts
 *
 * Env (optional):
 *   TEST_DIGEST_EMAIL=hashirahmedkhan123@gmail.com
 *   TEST_DIGEST_MERCHANT_ID=<uuid>   # if omitted, picks first approved active merchant
 *   TEST_DIGEST_YEAR=2026
 *   TEST_DIGEST_MONTH=8              # defaults to previous PKT calendar month
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../src/modules/prisma/prisma.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { MailModule } from '../src/modules/mail/mail.module';
import { MailService } from '../src/modules/mail/mail.service';
import { MerchantDigestPdfService } from '../src/modules/merchants/merchant-digest-pdf.service';
import { MerchantDigestService } from '../src/modules/merchants/merchant-digest.service';
import { previousPakistanCalendarMonthRange } from '../src/utils/pakistan-time.util';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
  ],
  providers: [MerchantDigestPdfService, MerchantDigestService],
})
class DigestTestModule {}

async function ensureDigestLogTable(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "public"."merchant_monthly_digest_logs" (
      "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
      "merchant_id" UUID NOT NULL,
      "period_year" INTEGER NOT NULL,
      "period_month" INTEGER NOT NULL,
      "status" VARCHAR(20) NOT NULL,
      "recipient_email" VARCHAR(255),
      "redemption_count" INTEGER NOT NULL DEFAULT 0,
      "error_message" TEXT,
      "sent_at" TIMESTAMPTZ(6),
      "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "merchant_monthly_digest_logs_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "uq_merchant_monthly_digest"
      ON "public"."merchant_monthly_digest_logs" ("merchant_id", "period_year", "period_month");
  `);
}

async function main() {
  const recipient =
    process.env.TEST_DIGEST_EMAIL || 'hashirahmedkhan123@gmail.com';

  const app = await NestFactory.createApplicationContext(DigestTestModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const digestService = app.get(MerchantDigestService);
  const pdfService = app.get(MerchantDigestPdfService);
  const mailService = app.get(MailService);
  const config = app.get(ConfigService);

  try {
    await ensureDigestLogTable(prisma);

    let merchantId = process.env.TEST_DIGEST_MERCHANT_ID;
    let businessName = '';

    if (!merchantId) {
      // Prefer a merchant already owned by / contacted at the test email
      const byEmail = await prisma.merchants.findFirst({
        where: {
          OR: [
            { contact_email: { equals: recipient, mode: 'insensitive' } },
            {
              users: {
                email: { equals: recipient, mode: 'insensitive' },
              },
            },
          ],
        },
        select: { id: true, business_name: true, contact_email: true },
      });

      if (byEmail) {
        merchantId = byEmail.id;
        businessName = byEmail.business_name;
        console.log(`Using merchant linked to ${recipient}: ${businessName}`);
      } else {
        const any = await prisma.merchants.findFirst({
          where: { is_active: true, verification_status: 'approved' },
          select: { id: true, business_name: true, contact_email: true },
          orderBy: { business_name: 'asc' },
        });
        if (!any) {
          throw new Error('No approved active merchant found');
        }
        merchantId = any.id;
        businessName = any.business_name;
        console.log(
          `No merchant for ${recipient}; using sample: ${businessName} (contact stays unchanged; email goes to test recipient only)`,
        );
      }
    } else {
      const m = await prisma.merchants.findUnique({
        where: { id: merchantId },
        select: { business_name: true },
      });
      businessName = m?.business_name ?? merchantId;
    }

    const prev = previousPakistanCalendarMonthRange(new Date());
    const year = process.env.TEST_DIGEST_YEAR
      ? Number(process.env.TEST_DIGEST_YEAR)
      : prev.year;
    const month = process.env.TEST_DIGEST_MONTH
      ? Number(process.env.TEST_DIGEST_MONTH)
      : prev.month;

    console.log(`Building digest for ${year}-${String(month).padStart(2, '0')}`);
    const digest = await digestService.buildDigestByMerchantId(
      merchantId!,
      year,
      month,
    );

    console.log(
      `Stats: redemptions=${digest.summary.totalRedemptions} students=${digest.summary.uniqueStudents} bonus=${digest.summary.bonusRedemptions} fixedPkr=${Math.round(digest.summary.totalFixedDiscountPkr)}`,
    );
    const bonusSample = digest.redemptions.filter((r) => r.isBonusApplied).slice(0, 3);
    console.log(
      'Bonus sample labels:',
      bonusSample.map((r) => `${r.bonusDiscountLabel} (type=${r.bonusDiscountType})`).join(', ') || 'none',
    );

    const pdfBuffer = await pdfService.generate(digest);
    const pdfFileName = `Parchi_Month_End_Digest_${year}-${String(month).padStart(2, '0')}.pdf`;
    const dashboardUrl = config.get<string>('MERCHANT_DASHBOARD_URL');

    console.log(`Sending PDF (${pdfBuffer.length} bytes) to ${recipient}`);
    const ok = await mailService.sendMerchantMonthEndDigestEmail({
      to: recipient,
      businessName: digest.businessName || businessName,
      periodLabel: digest.periodLabel,
      totalRedemptions: digest.summary.totalRedemptions,
      uniqueStudents: digest.summary.uniqueStudents,
      bonusRedemptions: digest.summary.bonusRedemptions,
      totalFixedDiscountPkr: digest.summary.totalFixedDiscountPkr,
      branchRows: digest.branchBreakdown,
      topOffers: digest.topOffers.map((o) => ({
        offerTitle: o.offerTitle,
        totalRedemptions: o.totalRedemptions,
        discountLabel: o.discountLabel,
      })),
      pdfBuffer,
      pdfFileName,
      dashboardUrl: dashboardUrl || undefined,
    });

    if (!ok) {
      throw new Error('Brevo send returned false  check BREVO_API_KEY / SMTP_FROM');
    }

    console.log('? Digest email sent successfully');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
