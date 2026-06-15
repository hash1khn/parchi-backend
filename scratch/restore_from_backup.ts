/**
 * Restore script — reads from a backup created by backup_before_resync.ts
 * and writes the original values back into all 5 tables.
 *
 * Usage:
 *   npx ts-node scratch/restore_from_backup.ts --timestamp=<TIMESTAMP>
 *
 * The timestamp is printed at the end of backup_before_resync.ts output.
 * Example:
 *   npx ts-node scratch/restore_from_backup.ts --timestamp=2026-06-15T08-54-00-000Z
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const BACKUP_DIR = path.join(__dirname, 'backups');

function parseArgs() {
  const args = process.argv.slice(2);
  let timestamp: string | undefined;
  for (const arg of args) {
    if (arg.startsWith('--timestamp=')) timestamp = arg.split('=')[1];
  }
  return { timestamp };
}

function readBackup<T>(filename: string): T[] {
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Backup file not found: ${filepath}`);
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8')) as T[];
}

async function main() {
  const { timestamp } = parseArgs();

  if (!timestamp) {
    console.error('❌ Missing --timestamp argument.');
    console.error('   Usage: npx ts-node scratch/restore_from_backup.ts --timestamp=<TIMESTAMP>');
    console.error('   The timestamp is in the backup manifest filename inside scratch/backups/');
    process.exit(1);
  }

  const manifestPath = path.join(BACKUP_DIR, `manifest_${timestamp}.json`);
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ No manifest found for timestamp: ${timestamp}`);
    console.error(`   Expected: ${manifestPath}`);
    console.error(`   Available manifests:`);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('manifest_'));
    files.forEach(f => console.error(`     ${f}`));
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log('=== Restore From Backup ===');
  console.log(`Backup timestamp : ${manifest.timestamp}`);
  console.log(`Backup created at: ${manifest.created_at}`);
  console.log(`Row counts in backup:`);
  Object.entries(manifest.row_counts).forEach(([table, count]) => {
    console.log(`  ${table.padEnd(25)}: ${count}`);
  });
  console.log('');

  // --- Restore students ---
  console.log('Restoring students...');
  const students = readBackup<any>(manifest.files.students);
  let count = 0;
  for (const row of students) {
    await prisma.students.update({
      where: { id: row.id },
      data: {
        total_redemptions: row.total_redemptions,
        lifetime_redemptions: row.lifetime_redemptions,
        total_savings: row.total_savings,
        last_redemption_at: row.last_redemption_at ? new Date(row.last_redemption_at) : null,
      },
    });
    count++;
    if (count % 100 === 0) console.log(`  Progress: ${count}/${students.length}`);
  }
  console.log(`  ✅ Restored ${count} student rows`);

  // --- Restore student_branch_stats ---
  console.log('Restoring student_branch_stats...');
  const branchStats = readBackup<any>(manifest.files.student_branch_stats);
  count = 0;
  for (const row of branchStats) {
    await prisma.student_branch_stats.update({
      where: { id: row.id },
      data: {
        redemption_count: row.redemption_count,
        total_savings: row.total_savings,
        last_redemption_at: row.last_redemption_at ? new Date(row.last_redemption_at) : null,
      },
    });
    count++;
    if (count % 100 === 0) console.log(`  Progress: ${count}/${branchStats.length}`);
  }
  console.log(`  ✅ Restored ${count} student_branch_stats rows`);

  // --- Restore student_merchant_stats ---
  console.log('Restoring student_merchant_stats...');
  const merchantStats = readBackup<any>(manifest.files.student_merchant_stats);
  count = 0;
  for (const row of merchantStats) {
    await prisma.student_merchant_stats.update({
      where: { id: row.id },
      data: {
        redemption_count: row.redemption_count,
        total_savings: row.total_savings,
        last_redemption_at: row.last_redemption_at ? new Date(row.last_redemption_at) : null,
      },
    });
    count++;
    if (count % 100 === 0) console.log(`  Progress: ${count}/${merchantStats.length}`);
  }
  console.log(`  ✅ Restored ${count} student_merchant_stats rows`);

  // --- Restore student_offer_stats ---
  console.log('Restoring student_offer_stats...');
  const offerStats = readBackup<any>(manifest.files.student_offer_stats);
  count = 0;
  for (const row of offerStats) {
    await (prisma as any).student_offer_stats.update({
      where: { id: row.id },
      data: {
        redemption_count: row.redemption_count,
        total_savings: row.total_savings,
        last_redemption_at: row.last_redemption_at ? new Date(row.last_redemption_at) : null,
      },
    });
    count++;
    if (count % 100 === 0) console.log(`  Progress: ${count}/${offerStats.length}`);
  }
  console.log(`  ✅ Restored ${count} student_offer_stats rows`);

  // --- Restore offers.current_redemptions ---
  console.log('Restoring offers.current_redemptions...');
  const offers = readBackup<any>(manifest.files.offers);
  count = 0;
  for (const row of offers) {
    await prisma.offers.update({
      where: { id: row.id },
      data: { current_redemptions: row.current_redemptions },
    });
    count++;
  }
  console.log(`  ✅ Restored ${count} offer rows`);

  console.log('\n=== Restore Complete ===');
  console.log('All tables have been rolled back to the backup state.');
}

main()
  .catch((e) => {
    console.error('Restore FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
