import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for discrepancies...');
  const students = await prisma.students.findMany({
    where: {
      verification_status: 'approved',
    },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      total_redemptions: true,
      lifetime_redemptions: true,
    }
  });

  console.log(`Total approved students: ${students.length}`);
  let discrepancies = 0;

  for (const student of students) {
    const verifiedCount = await prisma.redemptions.count({
      where: {
        student_id: student.id,
        verified_by: { not: null },
        OR: [
          { notes: null },
          { notes: { not: { contains: 'REJECTED' } } },
        ]
      }
    });

    const isDifferent = student.lifetime_redemptions !== verifiedCount || student.total_redemptions !== verifiedCount;

    if (isDifferent) {
      discrepancies++;
      console.log(`Discrepancy for ${student.first_name} ${student.last_name}:`, {
        total_redemptions: student.total_redemptions,
        lifetime_redemptions: student.lifetime_redemptions,
        verified_count_in_db: verifiedCount,
      });
    }
  }

  console.log(`Total discrepancies found: ${discrepancies}`);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
