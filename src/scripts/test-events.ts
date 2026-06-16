import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.analytics_events.groupBy({
    by: ['platform'],
    where: {
      event_name: 'app_opened',
    },
    _count: {
      platform: true,
      id: true,
    },
  });
  console.log('analytics_events app_opened group by platform:');
  console.log(JSON.stringify(events, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
