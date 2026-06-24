/**
 * Deletes redemptions made by specific students at any branch of a specific
 * merchant, then resyncs all denormalized counters from `redemptions`
 * (source of truth) for that merchant scope.
 *
 * Usage:
 *   npx ts-node scratch/wipe_student_merchant_redemptions.ts --dry-run
 *   npx ts-node scratch/wipe_student_merchant_redemptions.ts
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

const STUDENT_IDS = [
  '1eca45b6-c91f-4e03-b0fa-d63cd13f8a8d',
  'a52bb5d8-840a-458a-b449-980eaa16bec1',
];
const MERCHANT_ID = '4364a2f9-cb80-4ea6-9388-dcf5a54a1a81';

function parseArgs() {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs();
  console.log('=== Wipe Student Redemptions for Merchant ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Students: ${STUDENT_IDS.join(', ')}`);
  console.log(`Merchant: ${MERCHANT_ID}`);

  const branches = await prisma.merchant_branches.findMany({
    where: { merchant_id: MERCHANT_ID },
    select: { id: true, branch_name: true },
  });
  const branchIds = branches.map((b) => b.id);
  console.log(`\nBranches in scope (${branches.length}):`);
  branches.forEach((b) => console.log(`  - ${b.id}  ${b.branch_name}`));

  const matching = await prisma.redemptions.findMany({
    where: {
      student_id: { in: STUDENT_IDS },
      branch_id: { in: branchIds },
    },
    select: {
      id: true,
      student_id: true,
      branch_id: true,
      offer_id: true,
      created_at: true,
      verified_by: true,
      notes: true,
      is_bonus_applied: true,
      bonus_discount_applied: true,
    },
    orderBy: { created_at: 'asc' },
  });

  console.log(`\nMatching redemptions to delete: ${matching.length}`);
  matching.forEach((r) => {
    console.log(
      `  - ${r.id}  student=${r.student_id}  branch=${r.branch_id}  offer=${r.offer_id}  created_at=${r.created_at?.toISOString() ?? 'null'}  verified_by=${r.verified_by}  bonus=${r.is_bonus_applied}  notes=${r.notes ?? ''}`,
    );
  });

  if (matching.length === 0) {
    console.log('\nNothing to delete. Exiting.');
    return;
  }

  if (dryRun) {
    console.log(`\nDRY RUN: would delete ${matching.length} redemption(s). No changes made.`);
    return;
  }

  const ids = matching.map((r) => r.id);
  const result = await prisma.redemptions.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`\nDeleted ${result.count} redemption(s) from 'redemptions'.`);

  console.log('\n=== Now resyncing denormalized counters for this merchant ===');
  execSync(
    `npx ts-node scratch/resync_redemption_counters.ts --merchant-id=${MERCHANT_ID}`,
    { stdio: 'inherit', cwd: __dirname + '/..' },
  );
}

main()
  .catch((e) => {
    console.error('CRITICAL FAILURE:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
