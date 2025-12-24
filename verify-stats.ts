import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Login as a branch user
  // We need a valid branch user. Let's find one from the database or use a known one.
  // Assuming 'branch@example.com' exists or we can find one.
  
  const branchUser = await prisma.public_users.findFirst({
    where: { 
      role: 'merchant_branch',
      merchant_branches: {
        isNot: null
      }
    },
    include: { merchant_branches: true }
  });

  if (!branchUser) {
    console.log('No branch user found to test with.');
    return;
  }

  console.log(`Testing with branch user: ${branchUser.email}`);

  // We can't easily login without password, but we can simulate the service call directly 
  // OR we can generate a token if we had the secret.
  // Since we are in the backend repo, let's just call the service method directly to verify logic
  // effectively unit testing it.
  
  // Actually, we can't easily import the service here without Nest context.
  // Let's rely on manual verification via curl if the user provided credentials, 
  // BUT since I don't have credentials, I will verify by creating a dummy redemption for today/yesterday 
  // and checking if the logic holds in a standalone script.
  
  const branchId = branchUser.merchant_branches?.id;
  if (!branchId) {
     console.log('User has no branch linked.');
     return;
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const endOfYesterday = new Date(startOfToday);
  endOfYesterday.setMilliseconds(-1);

  const todayCount = await prisma.redemptions.count({
    where: { branch_id: branchId, created_at: { gte: startOfToday } }
  });

  const yesterdayCount = await prisma.redemptions.count({
    where: { branch_id: branchId, created_at: { gte: startOfYesterday, lte: endOfYesterday } }
  });

  console.log(`DB Counts - Today: ${todayCount}, Yesterday: ${yesterdayCount}`);
  
  let percentageChange = 0;
  if (yesterdayCount > 0) {
      percentageChange = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
  } else if (todayCount > 0) {
      percentageChange = 100;
  }
  
  console.log(`Calculated Percentage Change: ${Math.round(percentageChange)}%`);
}

main()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());
