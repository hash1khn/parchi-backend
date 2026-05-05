import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Migrating lifetime_redemptions for all students from redemptions table...');

  const students = await prisma.students.findMany({
    select: { id: true }
  });

  console.log(`Found ${students.length} students to process.`);

  for (const student of students) {
    const lifetimeCount = await prisma.redemptions.count({
      where: {
        student_id: student.id,
        verified_by: { not: null },
        NOT: {
          notes: { 
            contains: 'REJECTED', 
            mode: 'insensitive' 
          }
        }
      }
    });

    await prisma.students.update({
      where: { id: student.id },
      data: {
        lifetime_redemptions: lifetimeCount
      }
    });

    console.log(`Updated student ${student.id} with ${lifetimeCount} lifetime redemptions.`);
  }

  console.log('Migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
