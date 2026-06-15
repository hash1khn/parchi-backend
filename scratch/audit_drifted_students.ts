/**
 * Diagnostic-only script — NO database writes.
 *
 * Compares each student's denormalized counters in the `students` table
 * against the actual aggregates from the `redemptions` source of truth.
 *
 * Outputs a list of students whose numbers are drifted (don't match).
 *
 * Usage:
 *   npx ts-node scratch/audit_drifted_students.ts
 *   npx ts-node scratch/audit_drifted_students.ts --merchant-id=<uuid>
 *   npx ts-node scratch/audit_drifted_students.ts --branch-id=<uuid>
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let merchantId: string | undefined;
  let branchId: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--merchant-id=')) merchantId = arg.split('=')[1];
    else if (arg.startsWith('--branch-id=')) branchId = arg.split('=')[1];
  }

  return { merchantId, branchId };
}

async function main() {
  const { merchantId, branchId } = parseArgs();

  const scopeLabel = branchId
    ? `branch ${branchId}`
    : merchantId
    ? `merchant ${merchantId}`
    : 'platform-wide';

  console.log('=== Drifted Student Counter Audit ===');
  console.log(`Scope: ${scopeLabel}`);
  console.log('Mode: READ-ONLY — no writes will be made\n');

  // --- Build optional scope filter for the SQL ---
  let branchFilter = '';
  if (branchId) {
    branchFilter = `AND r.branch_id = '${branchId}'::uuid`;
  } else if (merchantId) {
    branchFilter = `AND mb.merchant_id = '${merchantId}'::uuid`;
  }

  const merchantJoin =
    merchantId && !branchId
      ? 'JOIN merchant_branches mb ON mb.id = r.branch_id'
      : '';

  // --- Aggregate true counts from redemptions (source of truth) ---
  const trueAggregates = await prisma.$queryRawUnsafe<
    Array<{
      student_id: string;
      true_count: bigint;
      true_savings: string;
    }>
  >(`
    SELECT
      r.student_id,
      COUNT(*)::bigint                                                   AS true_count,
      COALESCE(SUM(
        COALESCE(o.discount_value, 0) + COALESCE(r.bonus_discount_applied, 0)
      ), 0)::text                                                        AS true_savings
    FROM redemptions r
    JOIN offers o ON o.id = r.offer_id
    ${merchantJoin}
    WHERE r.verified_by IS NOT NULL
      AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED:%')
      ${branchFilter}
    GROUP BY r.student_id
  `);

  if (trueAggregates.length === 0) {
    console.log('No valid redemptions found in scope. Nothing to compare.');
    return;
  }

  const studentIds = trueAggregates.map((r) => r.student_id);

  // --- Fetch current denormalized values from students table ---
  const students = await prisma.students.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      parchi_id: true,
      first_name: true,
      last_name: true,
      university: true,
      lifetime_redemptions: true,
      total_redemptions: true,
      total_savings: true,
    },
  });

  const studentMap = new Map(students.map((s) => [s.id, s]));

  // --- Also catch students with drifted counters who have 0 real redemptions ---
  // (i.e., counters > 0 but no redemptions in the source of truth in scope)
  let studentsWithZeroButDrifted: typeof students = [];
  if (!branchId && !merchantId) {
    studentsWithZeroButDrifted = await prisma.students.findMany({
      where: {
        id: { notIn: studentIds },
        OR: [
          { lifetime_redemptions: { gt: 0 } },
          { total_redemptions: { gt: 0 } },
          { total_savings: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        parchi_id: true,
        first_name: true,
        last_name: true,
        university: true,
        lifetime_redemptions: true,
        total_redemptions: true,
        total_savings: true,
      },
    });
  }

  // --- Compare and find drifted students ---
  const drifted: Array<{
    parchi_id: string | null;
    name: string;
    university: string | null;
    field: string;
    stored: number;
    actual: number;
    diff: number;
  }> = [];

  for (const row of trueAggregates) {
    const student = studentMap.get(row.student_id);
    if (!student) continue;

    const trueCount = Number(row.true_count);
    const trueSavings = Math.round(parseFloat(row.true_savings));
    const storedCount = student.lifetime_redemptions ?? 0;
    const storedSavings = Math.round(Number(student.total_savings ?? 0));

    const name = `${student.first_name} ${student.last_name}`;

    if (storedCount !== trueCount) {
      drifted.push({
        parchi_id: student.parchi_id,
        name,
        university: student.university,
        field: 'lifetime_redemptions',
        stored: storedCount,
        actual: trueCount,
        diff: storedCount - trueCount,
      });
    }

    if (storedSavings !== trueSavings) {
      drifted.push({
        parchi_id: student.parchi_id,
        name,
        university: student.university,
        field: 'total_savings',
        stored: storedSavings,
        actual: trueSavings,
        diff: storedSavings - trueSavings,
      });
    }
  }

  // Students with non-zero stored counters but 0 valid redemptions
  for (const student of studentsWithZeroButDrifted) {
    const name = `${student.first_name} ${student.last_name}`;
    if ((student.lifetime_redemptions ?? 0) > 0) {
      drifted.push({
        parchi_id: student.parchi_id,
        name,
        university: student.university,
        field: 'lifetime_redemptions',
        stored: student.lifetime_redemptions ?? 0,
        actual: 0,
        diff: student.lifetime_redemptions ?? 0,
      });
    }
    if (Number(student.total_savings ?? 0) > 0) {
      drifted.push({
        parchi_id: student.parchi_id,
        name,
        university: student.university,
        field: 'total_savings',
        stored: Math.round(Number(student.total_savings ?? 0)),
        actual: 0,
        diff: Math.round(Number(student.total_savings ?? 0)),
      });
    }
  }

  // --- Print results ---
  if (drifted.length === 0) {
    console.log('✅ All student counters are in sync with the redemptions table. No drift found.');
    return;
  }

  // Group by student for cleaner output
  const byStudent = new Map<string, typeof drifted>();
  for (const row of drifted) {
    const key = row.parchi_id ?? row.name;
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key)!.push(row);
  }

  console.log(`⚠️  Found ${byStudent.size} student(s) with drifted counters:\n`);
  console.log(
    '─'.repeat(90),
  );

  let i = 1;
  for (const [, rows] of byStudent) {
    const r = rows[0];
    console.log(`${i}. ${r.name} | ID: ${r.parchi_id ?? 'N/A'} | University: ${r.university ?? 'N/A'}`);
    for (const field of rows) {
      const direction = field.diff > 0 ? `overstated by ${field.diff}` : `understated by ${Math.abs(field.diff)}`;
      console.log(
        `   • ${field.field.padEnd(25)} stored=${field.stored}  actual=${field.actual}  → ${direction}`,
      );
    }
    i++;
  }

  console.log('─'.repeat(90));
  console.log(`\nTotal drifted students: ${byStudent.size}`);
  console.log(
    `\nTo fix these, run:\n  npx ts-node scratch/resync_redemption_counters.ts --dry-run\n  npx ts-node scratch/resync_redemption_counters.ts`,
  );
}

main()
  .catch((e) => {
    console.error('Audit FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
