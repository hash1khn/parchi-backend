
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rawCounts: any[] = await prisma.$queryRaw`
    SELECT s.university, CAST(COUNT(r.id) AS INTEGER) as count
    FROM redemptions r
    JOIN students s ON r.student_id = s.id
    GROUP BY s.university
  `;
  console.log('Raw Counts:', rawCounts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
