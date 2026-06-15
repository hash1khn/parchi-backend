/**
 * Pre-resync backup script — READ ONLY, NO WRITES.
 *
 * Dumps the current state of all 5 tables that resync_redemption_counters.ts
 * will modify into JSON files inside scratch/backups/.
 *
 * Run this BEFORE running the resync script.
 *
 * Usage:
 *   npx ts-node scratch/backup_before_resync.ts
 *
 * To restore from a backup if something goes wrong:
 *   npx ts-node scratch/restore_from_backup.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const BACKUP_DIR = path.join(__dirname, 'backups');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function writeBackup(filename: string, data: any[]) {
  const filepath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  ✅ Saved ${data.length} rows → ${filepath}`);
  return filepath;
}

async function main() {
  ensureBackupDir();

  console.log('=== Pre-Resync Backup ===');
  console.log(`Timestamp : ${TIMESTAMP}`);
  console.log(`Output dir: ${BACKUP_DIR}\n`);

  // 1. students — only the fields the resync touches
  console.log('Backing up students...');
  const students = await prisma.students.findMany({
    select: {
      id: true,
      parchi_id: true,
      first_name: true,
      last_name: true,
      university: true,
      total_redemptions: true,
      lifetime_redemptions: true,
      total_savings: true,
      last_redemption_at: true,
    },
  });
  writeBackup(`students_${TIMESTAMP}.json`, students);

  // 2. student_branch_stats — all rows
  console.log('Backing up student_branch_stats...');
  const branchStats = await prisma.student_branch_stats.findMany({
    select: {
      id: true,
      student_id: true,
      branch_id: true,
      redemption_count: true,
      total_savings: true,
      last_redemption_at: true,
    },
  });
  writeBackup(`student_branch_stats_${TIMESTAMP}.json`, branchStats);

  // 3. student_merchant_stats — all rows
  console.log('Backing up student_merchant_stats...');
  const merchantStats = await prisma.student_merchant_stats.findMany({
    select: {
      id: true,
      student_id: true,
      merchant_id: true,
      redemption_count: true,
      total_savings: true,
      last_redemption_at: true,
    },
  });
  writeBackup(`student_merchant_stats_${TIMESTAMP}.json`, merchantStats);

  // 4. student_offer_stats — all rows (using queryRaw as prisma type may not be generated)
  console.log('Backing up student_offer_stats...');
  const offerStats = await (prisma as any).student_offer_stats.findMany({
    select: {
      id: true,
      student_id: true,
      offer_id: true,
      redemption_count: true,
      total_savings: true,
      last_redemption_at: true,
    },
  });
  writeBackup(`student_offer_stats_${TIMESTAMP}.json`, offerStats);

  // 5. offers — only current_redemptions (the only field the resync touches)
  console.log('Backing up offers.current_redemptions...');
  const offers = await prisma.offers.findMany({
    select: {
      id: true,
      title: true,
      current_redemptions: true,
    },
  });
  writeBackup(`offers_${TIMESTAMP}.json`, offers);

  // Write a manifest so restore script knows which files belong together
  const manifest = {
    timestamp: TIMESTAMP,
    created_at: new Date().toISOString(),
    files: {
      students: `students_${TIMESTAMP}.json`,
      student_branch_stats: `student_branch_stats_${TIMESTAMP}.json`,
      student_merchant_stats: `student_merchant_stats_${TIMESTAMP}.json`,
      student_offer_stats: `student_offer_stats_${TIMESTAMP}.json`,
      offers: `offers_${TIMESTAMP}.json`,
    },
    row_counts: {
      students: students.length,
      student_branch_stats: branchStats.length,
      student_merchant_stats: merchantStats.length,
      student_offer_stats: offerStats.length,
      offers: offers.length,
    },
  };
  const manifestPath = path.join(BACKUP_DIR, `manifest_${TIMESTAMP}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n✅ Manifest saved → ${manifestPath}`);
  console.log('\n=== Backup Complete ===');
  console.log('\nRow counts backed up:');
  console.log(`  students               : ${students.length}`);
  console.log(`  student_branch_stats   : ${branchStats.length}`);
  console.log(`  student_merchant_stats : ${merchantStats.length}`);
  console.log(`  student_offer_stats    : ${offerStats.length}`);
  console.log(`  offers                 : ${offers.length}`);
  console.log('\nYou can now safely run:');
  console.log('  npx ts-node scratch/resync_redemption_counters.ts');
  console.log('\nIf something goes wrong, restore with:');
  console.log(`  npx ts-node scratch/restore_from_backup.ts --timestamp=${TIMESTAMP}`);
}

main()
  .catch((e) => {
    console.error('Backup FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
