import { PartnerVerificationsCleanupTask } from './partner-verifications-cleanup.task';

describe('PartnerVerificationsCleanupTask', () => {
  it('purgeOld skips verifications that have a discount redemption', async () => {
    const deleteMany = jest.fn(async () => ({ count: 0 }));
    const prisma = {
      partner_verification_requests: {
        deleteMany,
        updateMany: jest.fn(),
      },
    };
    const task = new PartnerVerificationsCleanupTask(prisma as any);
    await task.purgeOld();
    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: { not: 'pending' },
        partner_discount_redemptions: { is: null },
      }),
    });
  });
});
