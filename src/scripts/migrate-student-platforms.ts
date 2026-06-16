import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting student platform migration...');

  // 1. Fetch all students
  const students = await prisma.students.findMany({
    select: { id: true, created_at: true, platform: true }
  });

  console.log(`Found ${students.length} students to process.`);

  // 2. Fetch all relevant signup events
  const events = await prisma.analytics_events.findMany({
    where: {
      event_name: {
        in: ['signup_completed', 'signup_step_1_start', 'signup_step_2_start', 'kyc_submitted']
      },
      platform: {
        not: null,
        notIn: ['', 'unknown', 'undefined']
      }
    },
    select: {
      created_at: true,
      platform: true
    }
  });

  console.log(`Found ${events.length} platform-annotated signup events.`);

  let updatedCount = 0;
  let iosCount = 0;
  let androidCount = 0;
  let unknownCount = 0;

  for (const s of students) {
    let resolvedPlatform: string = 'unknown';

    if (s.created_at) {
      const studentTime = s.created_at.getTime();
      let closestEvent: any = null;
      let minDiff = Infinity;

      for (const e of events) {
        const diff = Math.abs(e.created_at.getTime() - studentTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestEvent = e;
        }
      }

      // If matched within 5 minutes, use the event platform
      if (closestEvent && minDiff < 300000) {
        resolvedPlatform = closestEvent.platform.toLowerCase() === 'ios' ? 'ios' : 'android';
      }
    }

    // Update the student in DB
    await prisma.students.update({
      where: { id: s.id },
      data: { platform: resolvedPlatform }
    });

    updatedCount++;
    if (resolvedPlatform === 'ios') iosCount++;
    else if (resolvedPlatform === 'android') androidCount++;
    else unknownCount++;
  }

  console.log(`Migration complete! Processed: ${updatedCount} students.`);
  console.log(`iOS: ${iosCount}`);
  console.log(`Android: ${androidCount}`);
  console.log(`Unknown: ${unknownCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
