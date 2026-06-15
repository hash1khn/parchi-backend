/**
 * One-off idempotent resync of denormalized redemption counters from the
 * `redemptions` table (source of truth).
 *
 * Usage:
 *   npx ts-node scratch/resync_redemption_counters.ts [--dry-run]
 *   npx ts-node scratch/resync_redemption_counters.ts --merchant-id=<uuid>
 *   npx ts-node scratch/resync_redemption_counters.ts --branch-id=<uuid>
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VALID_REDEMPTION_SQL = `
  r.verified_by IS NOT NULL
  AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED:%')
`;

function parseArgs() {
  const args = process.argv.slice(2);
  let merchantId: string | undefined;
  let branchId: string | undefined;
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--merchant-id=')) merchantId = arg.split('=')[1];
    else if (arg.startsWith('--branch-id=')) branchId = arg.split('=')[1];
  }

  return { merchantId, branchId, dryRun };
}

function scopeRedemptionFilter(merchantId?: string, branchId?: string): string {
  if (branchId) {
    return `AND r.branch_id = '${branchId}'::uuid`;
  }
  if (merchantId) {
    return `AND mb.merchant_id = '${merchantId}'::uuid`;
  }
  return '';
}

async function getScopedBranchIds(merchantId?: string, branchId?: string): Promise<string[] | null> {
  if (branchId) return [branchId];
  if (merchantId) {
    const branches = await prisma.merchant_branches.findMany({
      where: { merchant_id: merchantId },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }
  return null;
}

async function getScopedMerchantId(merchantId?: string, branchId?: string): Promise<string | null> {
  if (merchantId) return merchantId;
  if (branchId) {
    const branch = await prisma.merchant_branches.findUnique({
      where: { id: branchId },
      select: { merchant_id: true },
    });
    return branch?.merchant_id ?? null;
  }
  return null;
}

async function getAffectedStudentIds(
  scopeFilter: string,
  branchIds: string[] | null,
  merchantId: string | null,
): Promise<string[]> {
  const joinMerchant = scopeFilter.includes('mb.merchant_id') ? 'JOIN merchant_branches mb ON mb.id = r.branch_id' : '';
  const rows = await prisma.$queryRawUnsafe<Array<{ student_id: string }>>(`
    SELECT DISTINCT r.student_id
    FROM redemptions r
    ${joinMerchant}
    WHERE ${VALID_REDEMPTION_SQL}
    ${scopeFilter}
  `);
  const fromRedemptions = new Set(rows.map((r) => r.student_id));

  // Include students with existing stats rows in scope (covers deleted redemption drift)
  if (branchIds?.length) {
    const branchStats = await prisma.student_branch_stats.findMany({
      where: { branch_id: { in: branchIds } },
      select: { student_id: true },
    });
    branchStats.forEach((s) => fromRedemptions.add(s.student_id));
  }
  if (merchantId) {
    const merchantStats = await prisma.student_merchant_stats.findMany({
      where: { merchant_id: merchantId },
      select: { student_id: true },
    });
    merchantStats.forEach((s) => fromRedemptions.add(s.student_id));
  }

  return [...fromRedemptions];
}

async function resyncStudents(
  dryRun: boolean,
  studentIds: string[] | null,
) {
  console.log('\n--- Resyncing students counters ---');

  const studentFilter = studentIds?.length
    ? `AND r.student_id IN (${studentIds.map((id) => `'${id}'::uuid`).join(',')})`
    : '';

  if (studentIds?.length === 0) {
    console.log('No students in scope, skipping.');
    return;
  }

  if (!studentIds && !dryRun) {
    console.log('Resetting all student redemption counters to 0...');
    await prisma.students.updateMany({
      data: {
        total_redemptions: 0,
        lifetime_redemptions: 0,
        total_savings: 0,
        last_redemption_at: null,
      },
    });
  } else if (studentIds && !dryRun) {
    console.log(`Resetting counters for ${studentIds.length} scoped students...`);
    await prisma.students.updateMany({
      where: { id: { in: studentIds } },
      data: {
        total_redemptions: 0,
        lifetime_redemptions: 0,
        total_savings: 0,
        last_redemption_at: null,
      },
    });
  }

  const aggregates = await prisma.$queryRawUnsafe<
    Array<{
      student_id: string;
      redemption_count: bigint;
      total_savings: string;
      last_redemption_at: Date | null;
    }>
  >(`
    SELECT
      r.student_id,
      COUNT(*)::bigint AS redemption_count,
      COALESCE(SUM(
        COALESCE(o.discount_value, 0) + COALESCE(r.bonus_discount_applied, 0)
      ), 0) AS total_savings,
      MAX(r.created_at) AS last_redemption_at
    FROM redemptions r
    JOIN offers o ON o.id = r.offer_id
    WHERE ${VALID_REDEMPTION_SQL}
    ${studentFilter}
    GROUP BY r.student_id
  `);

  console.log(`Recomputed stats for ${aggregates.length} students.`);

  let updated = 0;
  for (const row of aggregates) {
    if (!dryRun) {
      await prisma.students.update({
        where: { id: row.student_id },
        data: {
          total_redemptions: Number(row.redemption_count),
          lifetime_redemptions: Number(row.redemption_count),
          total_savings: Number(row.total_savings),
          last_redemption_at: row.last_redemption_at,
        },
      });
    }
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Progress: ${updated}/${aggregates.length} students`);
    }
  }
  console.log(`Students: ${dryRun ? 'would update' : 'updated'} ${updated} rows.`);
}

async function resyncStudentBranchStats(
  dryRun: boolean,
  branchIds: string[] | null,
) {
  console.log('\n--- Resyncing student_branch_stats ---');

  const branchFilter = branchIds?.length
    ? `AND r.branch_id IN (${branchIds.map((id) => `'${id}'::uuid`).join(',')})`
    : '';

  if (branchIds?.length === 0) {
    console.log('No branches in scope, skipping.');
    return;
  }

  if (!branchIds && !dryRun) {
    await prisma.student_branch_stats.updateMany({
      data: { redemption_count: 0, total_savings: 0, last_redemption_at: null },
    });
  } else if (branchIds && !dryRun) {
    await prisma.student_branch_stats.updateMany({
      where: { branch_id: { in: branchIds } },
      data: { redemption_count: 0, total_savings: 0, last_redemption_at: null },
    });
  }

  const aggregates = await prisma.$queryRawUnsafe<
    Array<{
      student_id: string;
      branch_id: string;
      redemption_count: bigint;
      total_savings: string;
      last_redemption_at: Date | null;
    }>
  >(`
    SELECT
      r.student_id,
      r.branch_id,
      COUNT(*)::bigint AS redemption_count,
      COALESCE(SUM(
        COALESCE(o.discount_value, 0) + COALESCE(r.bonus_discount_applied, 0)
      ), 0) AS total_savings,
      MAX(r.created_at) AS last_redemption_at
    FROM redemptions r
    JOIN offers o ON o.id = r.offer_id
    WHERE ${VALID_REDEMPTION_SQL}
    ${branchFilter}
    GROUP BY r.student_id, r.branch_id
  `);

  let updated = 0;
  for (const row of aggregates) {
    if (!dryRun) {
      await prisma.student_branch_stats.upsert({
        where: {
          student_id_branch_id: {
            student_id: row.student_id,
            branch_id: row.branch_id,
          },
        },
        update: {
          redemption_count: Number(row.redemption_count),
          total_savings: Number(row.total_savings),
          last_redemption_at: row.last_redemption_at,
        },
        create: {
          student_id: row.student_id,
          branch_id: row.branch_id,
          redemption_count: Number(row.redemption_count),
          total_savings: Number(row.total_savings),
          last_redemption_at: row.last_redemption_at,
        },
      });
    }
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Progress: ${updated}/${aggregates.length} branch stats`);
    }
  }
  console.log(`student_branch_stats: ${dryRun ? 'would update' : 'updated'} ${updated} rows.`);
}

async function resyncStudentMerchantStats(
  dryRun: boolean,
  merchantId: string | null,
  scopeFilter: string,
) {
  console.log('\n--- Resyncing student_merchant_stats ---');

  const merchantFilter = merchantId ? `AND mb.merchant_id = '${merchantId}'::uuid` : '';

  if (!merchantId && !dryRun) {
    await prisma.student_merchant_stats.updateMany({
      data: { redemption_count: 0, total_savings: 0, last_redemption_at: null },
    });
  } else if (merchantId && !dryRun) {
    await prisma.student_merchant_stats.updateMany({
      where: { merchant_id: merchantId },
      data: { redemption_count: 0, total_savings: 0, last_redemption_at: null },
    });
  }

  const aggregates = await prisma.$queryRawUnsafe<
    Array<{
      student_id: string;
      merchant_id: string;
      redemption_count: bigint;
      total_savings: string;
      last_redemption_at: Date | null;
    }>
  >(`
    SELECT
      r.student_id,
      mb.merchant_id,
      COUNT(*)::bigint AS redemption_count,
      COALESCE(SUM(
        COALESCE(o.discount_value, 0) + COALESCE(r.bonus_discount_applied, 0)
      ), 0) AS total_savings,
      MAX(r.created_at) AS last_redemption_at
    FROM redemptions r
    JOIN offers o ON o.id = r.offer_id
    JOIN merchant_branches mb ON mb.id = r.branch_id
    WHERE ${VALID_REDEMPTION_SQL}
    ${merchantFilter}
    ${scopeFilter.includes('branch_id') ? scopeFilter : ''}
    GROUP BY r.student_id, mb.merchant_id
  `);

  let updated = 0;
  for (const row of aggregates) {
    if (!dryRun) {
      await prisma.student_merchant_stats.upsert({
        where: {
          student_id_merchant_id: {
            student_id: row.student_id,
            merchant_id: row.merchant_id,
          },
        },
        update: {
          redemption_count: Number(row.redemption_count),
          total_savings: Number(row.total_savings),
          last_redemption_at: row.last_redemption_at,
        },
        create: {
          student_id: row.student_id,
          merchant_id: row.merchant_id,
          redemption_count: Number(row.redemption_count),
          total_savings: Number(row.total_savings),
          last_redemption_at: row.last_redemption_at,
        },
      });
    }
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Progress: ${updated}/${aggregates.length} merchant stats`);
    }
  }
  console.log(`student_merchant_stats: ${dryRun ? 'would update' : 'updated'} ${updated} rows.`);
}

async function resyncStudentOfferStats(
  dryRun: boolean,
  merchantId: string | null,
  scopeFilter: string,
) {
  console.log('\n--- Resyncing student_offer_stats ---');

  const offerMerchantFilter = merchantId ? `AND o.merchant_id = '${merchantId}'::uuid` : '';
  const branchScope = scopeFilter.includes('branch_id') ? scopeFilter : '';

  if (!merchantId && !dryRun) {
    await (prisma as any).student_offer_stats.updateMany({
      data: { redemption_count: 0, total_savings: 0, last_redemption_at: null },
    });
  } else if (merchantId && !dryRun) {
    const offerIds = (
      await prisma.offers.findMany({
        where: { merchant_id: merchantId },
        select: { id: true },
      })
    ).map((o) => o.id);
    if (offerIds.length > 0) {
      await (prisma as any).student_offer_stats.updateMany({
        where: { offer_id: { in: offerIds } },
        data: { redemption_count: 0, total_savings: 0, last_redemption_at: null },
      });
    }
  }

  const aggregates = await prisma.$queryRawUnsafe<
    Array<{
      student_id: string;
      offer_id: string;
      redemption_count: bigint;
      total_savings: string;
      last_redemption_at: Date | null;
    }>
  >(`
    SELECT
      r.student_id,
      r.offer_id,
      COUNT(*)::bigint AS redemption_count,
      COALESCE(SUM(
        COALESCE(o.discount_value, 0) + COALESCE(r.bonus_discount_applied, 0)
      ), 0) AS total_savings,
      MAX(r.created_at) AS last_redemption_at
    FROM redemptions r
    JOIN offers o ON o.id = r.offer_id
    WHERE ${VALID_REDEMPTION_SQL}
    ${offerMerchantFilter}
    ${branchScope}
    GROUP BY r.student_id, r.offer_id
  `);

  let updated = 0;
  for (const row of aggregates) {
    if (!dryRun) {
      await (prisma as any).student_offer_stats.upsert({
        where: {
          student_id_offer_id: {
            student_id: row.student_id,
            offer_id: row.offer_id,
          },
        },
        update: {
          redemption_count: Number(row.redemption_count),
          total_savings: Number(row.total_savings),
          last_redemption_at: row.last_redemption_at,
        },
        create: {
          student_id: row.student_id,
          offer_id: row.offer_id,
          redemption_count: Number(row.redemption_count),
          total_savings: Number(row.total_savings),
          last_redemption_at: row.last_redemption_at,
        },
      });
    }
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Progress: ${updated}/${aggregates.length} offer stats`);
    }
  }
  console.log(`student_offer_stats: ${dryRun ? 'would update' : 'updated'} ${updated} rows.`);
}

async function resyncOfferCurrentRedemptions(
  dryRun: boolean,
  merchantId: string | null,
  scopeFilter: string,
) {
  console.log('\n--- Resyncing offers.current_redemptions ---');

  const offerMerchantFilter = merchantId ? `AND o.merchant_id = '${merchantId}'::uuid` : '';
  const branchScope = scopeFilter.includes('branch_id') ? scopeFilter : '';

  if (!merchantId && !dryRun) {
    await prisma.offers.updateMany({ data: { current_redemptions: 0 } });
  } else if (merchantId && !dryRun) {
    await prisma.offers.updateMany({
      where: { merchant_id: merchantId },
      data: { current_redemptions: 0 },
    });
  }

  const aggregates = await prisma.$queryRawUnsafe<
    Array<{ offer_id: string; redemption_count: bigint }>
  >(`
    SELECT
      r.offer_id,
      COUNT(*)::bigint AS redemption_count
    FROM redemptions r
    JOIN offers o ON o.id = r.offer_id
    WHERE ${VALID_REDEMPTION_SQL}
    ${offerMerchantFilter}
    ${branchScope}
    GROUP BY r.offer_id
  `);

  let updated = 0;
  for (const row of aggregates) {
    if (!dryRun) {
      await prisma.offers.update({
        where: { id: row.offer_id },
        data: { current_redemptions: Number(row.redemption_count) },
      });
    }
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Progress: ${updated}/${aggregates.length} offers`);
    }
  }
  console.log(`offers.current_redemptions: ${dryRun ? 'would update' : 'updated'} ${updated} rows.`);
}

async function main() {
  const { merchantId, branchId, dryRun } = parseArgs();
  const scopeFilter = scopeRedemptionFilter(merchantId, branchId);
  const isScoped = !!(merchantId || branchId);

  console.log('=== Resync Redemption Counters ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Scope: ${isScoped ? (branchId ? `branch ${branchId}` : `merchant ${merchantId}`) : 'platform-wide'}`);

  const branchIds = await getScopedBranchIds(merchantId, branchId);
  const scopedMerchantId = await getScopedMerchantId(merchantId, branchId);

  let affectedStudentIds: string[] | null = null;
  if (isScoped) {
    affectedStudentIds = await getAffectedStudentIds(scopeFilter, branchIds, scopedMerchantId);
    console.log(`Affected students in scope: ${affectedStudentIds.length}`);
  }

  await resyncStudents(dryRun, isScoped ? affectedStudentIds : null);
  await resyncStudentBranchStats(dryRun, isScoped ? branchIds : null);
  await resyncStudentMerchantStats(dryRun, isScoped ? scopedMerchantId : null, scopeFilter);
  await resyncStudentOfferStats(dryRun, isScoped ? scopedMerchantId : null, scopeFilter);
  await resyncOfferCurrentRedemptions(dryRun, isScoped ? scopedMerchantId : null, scopeFilter);

  console.log('\n=== RESYNC COMPLETE ===');
}

main()
  .catch((e) => {
    console.error('Resync CRITICAL FAILURE:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
