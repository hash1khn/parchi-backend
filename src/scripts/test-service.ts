import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getPlatformDistribution(startDate?: Date, endDate?: Date) {
  const where: any = {};
  if (startDate || endDate) {
    where.created_at = {};
    if (startDate) where.created_at.gte = startDate;
    if (endDate) where.created_at.lte = endDate;
  }

  const distribution = await prisma.students.groupBy({
    by: ['platform'],
    where,
    _count: {
      id: true,
    },
  });

  const platformMap = new Map<string, number>();
  distribution.forEach((item) => {
    const platform = (item.platform || 'unknown').toLowerCase();
    platformMap.set(platform, (platformMap.get(platform) || 0) + item._count.id);
  });

  return Array.from(platformMap.entries()).map(([platform, count]) => ({
    platform,
    count,
  }));
}

async function main() {
  const res = await getPlatformDistribution();
  console.log('Result from improved service logic:', res);
}

main().catch(console.error).finally(() => prisma.$disconnect());
