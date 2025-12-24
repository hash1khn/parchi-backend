
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Verifying Redemption APIs Logic...');

  // 1. Find a valid branch user
  const branchUser = await prisma.public_users.findFirst({
    where: { 
      role: 'merchant_branch',
      merchant_branches: { isNot: null }
    },
    include: { merchant_branches: true }
  });

  if (!branchUser || !branchUser.merchant_branches) {
    console.log('❌ No valid branch user found.');
    return;
  }

  const branchId = branchUser.merchant_branches.id;
  console.log(`Using Branch: ${branchUser.merchant_branches.branch_name} (${branchId})`);

  // Find a student and offer to create dummy redemptions
  const student = await prisma.students.findFirst();
  
  // Find an offer linked to this branch
  const offerBranch = await prisma.offer_branches.findFirst({
    where: { branch_id: branchId },
    include: { offers: true }
  });
  const offer = offerBranch?.offers;

  if (student && offer) {
    console.log('Creating dummy redemptions...');
    // Create one for yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await prisma.redemptions.create({
      data: {
        branch_id: branchId,
        student_id: student.id,
        offer_id: offer.id,
        verified_by: branchUser.id,
        created_at: yesterday,
        is_bonus_applied: false
      }
    });

    // Create two for today
    await prisma.redemptions.createMany({
      data: [
        {
          branch_id: branchId,
          student_id: student.id,
          offer_id: offer.id,
          verified_by: branchUser.id,
          is_bonus_applied: false
        },
        {
          branch_id: branchId,
          student_id: student.id,
          offer_id: offer.id,
          verified_by: branchUser.id,
          is_bonus_applied: true
        }
      ]
    });
    console.log('Dummy redemptions created.');
  } else {
    console.log('Could not create dummy data: missing student or offer for this branch.');
  }

  // --- Verify Daily Stats Logic ---
  console.log('\n--- Verifying Daily Stats ---');
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

  let percentageChange = 0;
  let trend = 'neutral';

  if (yesterdayCount > 0) {
    percentageChange = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
  } else if (todayCount > 0) {
    percentageChange = 100;
  }

  if (percentageChange > 0) trend = 'up';
  else if (percentageChange < 0) trend = 'down';

  console.log(`Today: ${todayCount}, Yesterday: ${yesterdayCount}`);
  console.log(`Change: ${Math.round(percentageChange)}%, Trend: ${trend}`);

  // --- Verify Daily Details Logic ---
  console.log('\n--- Verifying Daily Details ---');
  const redemptions = await prisma.redemptions.findMany({
    where: {
      branch_id: branchId,
      created_at: { gte: startOfToday },
    },
    include: {
      students: { select: { parchi_id: true } },
      offers: { select: { title: true, discount_type: true, discount_value: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  console.log(`Found ${redemptions.length} redemptions for today.`);
  
  const formatted = redemptions.map(r => {
    let discountDetails = '';
    if (r.is_bonus_applied) {
      discountDetails = 'Bonus Reward';
    } else {
      const value = Number(r.offers.discount_value);
      discountDetails = r.offers.discount_type === 'percentage' ? `${value}% off` : `Rs. ${value} off`;
    }
    return {
      id: r.id,
      parchiId: r.students.parchi_id,
      offerTitle: r.offers.title,
      discountDetails
    };
  });

  if (formatted.length > 0) {
    console.log('Sample Redemption:', formatted[0]);
  } else {
    console.log('No redemptions today to show details for.');
  }

  // --- Verify Aggregated Stats Logic ---
  console.log('\n--- Verifying Aggregated Stats ---');
  
  // 1. Standard "Today" Range (00:00:00 to 23:59:59)
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  // 2. Hourly Chart Range (Today 06:00 to Tomorrow 02:00)
  const chartStart = new Date(now);
  chartStart.setHours(6, 0, 0, 0);
  
  const chartEnd = new Date(now);
  chartEnd.setDate(chartEnd.getDate() + 1); // Tomorrow
  chartEnd.setHours(2, 0, 0, 0);

  const [todayRedemptions, chartRedemptions] = await Promise.all([
    prisma.redemptions.findMany({
      where: {
        branch_id: branchId,
        created_at: { gte: startOfToday, lte: endOfToday },
      },
      select: { student_id: true, is_bonus_applied: true },
    }),
    prisma.redemptions.findMany({
      where: {
        branch_id: branchId,
        created_at: { gte: chartStart, lte: chartEnd },
      },
      select: { created_at: true },
    }),
  ]);

  const uniqueStudents = new Set(todayRedemptions.map(r => r.student_id)).size;
  const bonusDealsCount = todayRedemptions.filter(r => r.is_bonus_applied).length;

  console.log(`Unique Students: ${uniqueStudents}`);
  console.log(`Bonus Deals: ${bonusDealsCount}`);

  // Hourly Data Processing
  const hourlyMap = new Map<number, number>();
  const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];
  hours.forEach(h => hourlyMap.set(h, 0));

  chartRedemptions.forEach(r => {
    if (r.created_at) {
      const h = new Date(r.created_at).getHours();
      if (hourlyMap.has(h)) {
        hourlyMap.set(h, (hourlyMap.get(h) || 0) + 1);
      }
    }
  });

  const hourlyData = hours.map(h => ({
    hour: h,
    count: hourlyMap.get(h) || 0,
    label: h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`
  }));

  let maxCount = -1;
  let peakHourLabel = 'N/A';
  hourlyData.forEach(d => {
    if (d.count > maxCount) {
      maxCount = d.count;
      peakHourLabel = d.label;
    }
  });
  if (maxCount === 0) peakHourLabel = 'N/A';

  console.log(`Peak Hour: ${peakHourLabel} (Count: ${maxCount})`);
  console.log('Hourly Data (First 5):', hourlyData.slice(0, 5));
}

main()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());
