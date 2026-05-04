import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Populating last_redemption_at for all students...');

  const students = await prisma.students.findMany({
    select: { id: true }
  });

  for (const student of students) {
    const latestRedemption = await prisma.redemptions.findFirst({
      where: {
        student_id: student.id,
        verified_by: { not: null },
        NOT: {
          notes: { contains: 'REJECTED', mode: 'insensitive' }
        }
      },
      orderBy: { created_at: 'desc' },
      select: { created_at: true }
    });

    if (latestRedemption) {
      await prisma.students.update({
        where: { id: student.id },
        data: {
          last_redemption_at: latestRedemption.created_at
        }
      });
      console.log(`Updated student ${student.id} with date ${latestRedemption.created_at}`);
    }
  }

  console.log('Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
