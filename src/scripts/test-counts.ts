import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allStudents = await prisma.students.count();
  console.log('Total students in DB:', allStudents);

  const approvedStudents = await prisma.students.count({
    where: { verification_status: 'approved' }
  });
  console.log('Approved students in DB:', approvedStudents);

  const groupByPlatformAll = await prisma.students.groupBy({
    by: ['platform'],
    _count: {
      id: true,
    },
  });
  console.log('Group by platform (All):', JSON.stringify(groupByPlatformAll, null, 2));

  const groupByPlatformApproved = await prisma.students.groupBy({
    by: ['platform'],
    where: { verification_status: 'approved' },
    _count: {
      id: true,
    },
  });
  console.log('Group by platform (Approved):', JSON.stringify(groupByPlatformApproved, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
