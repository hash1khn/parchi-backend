import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const parchiId = 'PK-34738';
  const offerId = '3c9c7319-a6c6-4745-8276-5da165ca5ea5';

  console.log(`Checking data for Parchi ID: ${parchiId} and Offer ID: ${offerId}`);

  // 1. Get Student
  const student = await prisma.students.findUnique({
    where: { parchi_id: parchiId },
  });

  if (!student) {
    console.log('Student not found');
    return;
  }
  console.log('Student found:', student.id);

  // 2. Get Offer to find Merchant
  const offer = await prisma.offers.findUnique({
    where: { id: offerId },
  });

  if (!offer) {
    console.log('Offer not found');
    return;
  }
  console.log('Offer found, Merchant ID:', offer.merchant_id);

  // 3a. Get Student Merchant Stats
  const merchantStats = await prisma.student_merchant_stats.findUnique({
    where: {
      student_id_merchant_id: {
        student_id: student.id,
        merchant_id: offer.merchant_id,
      },
    },
  });
  console.log('Student Merchant Stats:', merchantStats);

  // 3b. Get Student Branch Stats
  // We need to find the branch first. The offer might be linked to multiple, but let's check all branches for this merchant/student.
  const branchStats = await prisma.student_branch_stats.findMany({
    where: {
      student_id: student.id,
      merchant_branches: {
        merchant_id: offer.merchant_id
      }
    },
    include: {
      merchant_branches: true
    }
  });
  console.log('Student Branch Stats:', branchStats);

  // 4. Get Bonus Settings
  const settings = await prisma.merchant_bonus_settings.findUnique({
    where: { merchant_id: offer.merchant_id },
  });
  console.log('Bonus Settings:', settings);

  // 5. Calculate Logic
  // We assume the first branch found is the one we care about for this test
  const targetBranchStats = branchStats.length > 0 ? branchStats[0] : null;
  const currentRedemptions = targetBranchStats?.redemption_count || 0;
  const redemptionsRequired = settings?.redemptions_required || 5;
  const isActive = settings?.is_active;

  console.log('--- Calculation ---');
  console.log(`Current Redemptions: ${currentRedemptions}`);
  console.log(`Redemptions Required: ${redemptionsRequired}`);
  console.log(`Is Active: ${isActive}`);
  
  const isBonusEligible = isActive && (currentRedemptions + 1) % redemptionsRequired === 0;
  console.log(`( ${currentRedemptions} + 1 ) % ${redemptionsRequired} === 0  =>  ${(currentRedemptions + 1) % redemptionsRequired === 0}`);
  console.log(`Is Bonus Eligible: ${isBonusEligible}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
