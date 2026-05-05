import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- STARTING OPTIMIZED MIGRATION FOR lifetime_redemptions ---');

  // 1. Clear the column first
  console.log('Resetting lifetime_redemptions to 0 for all students...');
  await prisma.students.updateMany({
    data: { lifetime_redemptions: 0 }
  });

  // 2. Perform an aggregated count of verified, non-rejected redemptions
  console.log('Calculating lifetime counts from redemptions table...');
  const counts = await prisma.$queryRaw<Array<{ student_id: string; actual_count: bigint }>>`
    SELECT 
      student_id, 
      COUNT(*) as actual_count
    FROM 
      public.redemptions
    WHERE 
      verified_by IS NOT NULL
      AND (notes IS NULL OR notes NOT ILIKE '%REJECTED%')
    GROUP BY 
      student_id
  `;

  console.log(`Found counts for ${counts.length} students. Updating database...`);

  // 3. Batch update the students
  let updatedCount = 0;
  for (const row of counts) {
    await prisma.students.update({
      where: { id: row.student_id },
      data: { lifetime_redemptions: Number(row.actual_count) }
    });
    updatedCount++;
    if (updatedCount % 50 === 0) {
      console.log(`Progress: Updated ${updatedCount}/${counts.length} students...`);
    }
  }

  console.log(`--- MIGRATION COMPLETE ---`);
  console.log(`Successfully populated lifetime_redemptions for ${updatedCount} students.`);
}

main()
  .catch((e) => {
    console.error('Migration CRITICAL FAILURE:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
