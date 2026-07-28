import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function deleteMerchant(businessName: string) {
  const merchant = await prisma.merchants.findFirst({
    where: { business_name: businessName },
    include: { users: true },
  });

  if (!merchant) {
    console.log(`SKIP: "${businessName}" not found`);
    return;
  }

  const branches = await prisma.merchant_branches.findMany({
    where: { merchant_id: merchant.id },
    select: { id: true, user_id: true },
  });
  const branchIds = branches.map((b) => b.id);

  const userIdsToDelete = [
    merchant.user_id,
    ...branches.map((b) => b.user_id).filter((uid): uid is string => Boolean(uid)),
  ];

  console.log(`\n=== ${businessName} (id=${merchant.id}) ===`);
  console.log(`  branches: ${branchIds.length}`);
  console.log(`  users to delete: ${userIdsToDelete.length}`);

  if (DRY_RUN) return;

  await prisma.$transaction(async (tx) => {
    if (branchIds.length > 0) {
      const r = await tx.redemptions.deleteMany({ where: { branch_id: { in: branchIds } } });
      console.log(`  redemptions deleted: ${r.count}`);
    }

    const lp = await tx.loyalty_programs.deleteMany({ where: { merchant_id: merchant.id } });
    console.log(`  loyalty_programs deleted: ${lp.count}`);

    await tx.merchants.delete({ where: { id: merchant.id } });
    console.log(`  merchant deleted`);

    if (userIdsToDelete.length > 0) {
      await tx.audit_logs.updateMany({
        where: { user_id: { in: userIdsToDelete } },
        data: { user_id: null },
      });
      const u = await tx.public_users.deleteMany({ where: { id: { in: userIdsToDelete } } });
      console.log(`  users deleted: ${u.count}`);
    }
  });
}

async function main() {
  if (DRY_RUN) console.log('[DRY RUN] No changes will be written.');

  for (const name of ['Ooko Pizza', 'Soul Bistro', 'Kababjees']) {
    await deleteMerchant(name);
  }

  console.log(DRY_RUN ? '\n[DRY RUN] Run without --dry-run to apply changes.' : '\nDone.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
