import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial app configuration...');
  
  const existing = await prisma.app_configs.findFirst();
  
  if (existing) {
    console.log('App configuration already exists. Skipping seed.');
    return;
  }

  await prisma.app_configs.create({
    data: {
      min_android_build_number: 27,
      min_ios_build_number: 27,
      force_update_title: 'Time for an Upgrade! 🚀',
      force_update_message: 'To keep your Parchiyan safe and enjoy new deals, please update to the latest version.',
      is_under_maintenance: false,
      auto_queue_offers: true,
      auto_queue_partners: true,
    },
  });

  console.log('Seeded initial app configuration successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding app configuration:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
