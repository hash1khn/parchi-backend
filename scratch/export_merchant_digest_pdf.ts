/**
 * Generate Melbrew (or any merchant) digest PDF to disk for a calendar month.
 *
 * Usage:
 *   TEST_DIGEST_MERCHANT_ID=56fcd831-58f7-4dde-aa93-9fb0cf45f4ab \
 *   TEST_DIGEST_YEAR=2026 TEST_DIGEST_MONTH=9 \
 *   npx ts-node -r tsconfig-paths/register scratch/export_merchant_digest_pdf.ts
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaModule } from '../src/modules/prisma/prisma.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { MailModule } from '../src/modules/mail/mail.module';
import { RedisModule } from '../src/modules/redis/redis.module';
import { MerchantDigestPdfService } from '../src/modules/merchants/merchant-digest-pdf.service';
import { MerchantDigestService } from '../src/modules/merchants/merchant-digest.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    RedisModule,
  ],
  providers: [MerchantDigestPdfService, MerchantDigestService],
})
class DigestExportModule {}

async function main() {
  const merchantId =
    process.env.TEST_DIGEST_MERCHANT_ID ||
    '56fcd831-58f7-4dde-aa93-9fb0cf45f4ab'; // Melbrew Coffee
  const year = Number(process.env.TEST_DIGEST_YEAR || 2026);
  const month = Number(process.env.TEST_DIGEST_MONTH || 9);

  const app = await NestFactory.createApplicationContext(DigestExportModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const digestService = app.get(MerchantDigestService);
  const pdfService = app.get(MerchantDigestPdfService);

  try {
    const merchant = await prisma.merchants.findUnique({
      where: { id: merchantId },
      select: { business_name: true },
    });
    if (!merchant) throw new Error(`Merchant not found: ${merchantId}`);

    console.log(
      `Building ${merchant.business_name} digest for ${year}-${String(month).padStart(2, '0')} (month-to-date if current month)�`,
    );

    const digest = await digestService.buildDigestByMerchantId(
      merchantId,
      year,
      month,
    );

    console.log(
      `Stats: redemptions=${digest.summary.totalRedemptions} students=${digest.summary.uniqueStudents} bonus=${digest.summary.bonusRedemptions}`,
    );

    const pdfBuffer = await pdfService.generate(digest);
    const outDir = join(__dirname, 'digest-preview');
    mkdirSync(outDir, { recursive: true });
    const fileName = `Parchi_Month_End_Digest_${merchant.business_name.replace(/\s+/g, '_')}_${year}-${String(month).padStart(2, '0')}.pdf`;
    const outPath = join(outDir, fileName);
    writeFileSync(outPath, pdfBuffer);
    console.log(`Wrote ${pdfBuffer.length} bytes ? ${outPath}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
