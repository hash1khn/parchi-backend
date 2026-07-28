import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const OLD_NAME = 'Institute of Business Administration';
  const NEW_NAME = 'IBA Karachi';

  if (DRY_RUN) console.log('[DRY RUN] No changes will be written.\n');

  // Institutes table
  const institutes = await prisma.institutes.findMany({
    where: { name: OLD_NAME },
    select: { id: true, name: true },
  });
  console.log(`institutes table: ${institutes.length} row(s) would be updated`);
  for (const r of institutes) console.log(`  id=${r.id}  "${r.name}" -> "${NEW_NAME}"`);

  // Students table
  const students = await prisma.students.findMany({
    where: { university: OLD_NAME },
    select: { id: true, first_name: true, last_name: true, university: true },
  });
  console.log(`\nstudents table: ${students.length} row(s) would be updated`);
  for (const r of students) console.log(`  id=${r.id}  name=${r.first_name} ${r.last_name}  "${r.university}" -> "${NEW_NAME}"`);

  if (!DRY_RUN) {
    const instituteResult = await prisma.institutes.updateMany({
      where: { name: OLD_NAME },
      data: { name: NEW_NAME },
    });
    console.log(`\ninstitutes table: updated ${instituteResult.count} row(s)`);

    const studentResult = await prisma.students.updateMany({
      where: { university: OLD_NAME },
      data: { university: NEW_NAME },
    });
    console.log(`students table: updated ${studentResult.count} row(s)`);

    console.log('Done.');
  } else {
    console.log('\n[DRY RUN] Run without --dry-run to apply changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
