import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedemptionsService } from './redemptions.service';
import { ROLES } from '../../constants/app.constants';

describe('RedemptionsService partner discount history', () => {
  const studentId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const partnerRedemptionId = '33333333-3333-3333-3333-333333333333';
  const merchantRedemptionId = '44444444-4444-4444-4444-444444444444';
  const partnerId = '55555555-5555-5555-5555-555555555555';

  const currentUser = {
    id: userId,
    role: ROLES.STUDENT,
  } as any;

  let service: RedemptionsService;
  let prisma: any;

  const partnerRow = {
    id: partnerRedemptionId,
    student_id: studentId,
    partner_id: partnerId,
    event_label: "PRISMFEST'26 - 20 Oct",
    discount_amount_pkr: 1199.8,
    paid_at: new Date('2026-10-08T12:00:00.000Z'),
    created_at: new Date('2026-10-08T12:00:00.000Z'),
    partner_api_keys: { partner_name: 'inside_karachi' },
  };

  const merchantRow = {
    id: merchantRedemptionId,
    student_id: studentId,
    offer_id: '66666666-6666-6666-6666-666666666666',
    branch_id: '77777777-7777-7777-7777-777777777777',
    is_bonus_applied: false,
    bonus_discount_applied: null,
    verified_by: 'staff-1',
    notes: null,
    created_at: new Date('2026-10-07T12:00:00.000Z'),
    merchant_branches: {
      branch_name: 'Gulshan-e-Iqbal',
      merchants: {
        business_name: 'Melbrew Coffee',
        logo_path: null,
      },
    },
  };

  beforeEach(() => {
    prisma = {
      students: {
        findUnique: jest.fn().mockResolvedValue({
          id: studentId,
          user_id: userId,
          lifetime_redemptions: 32,
          last_redemption_at: new Date('2026-10-07T12:00:00.000Z'),
        }),
        count: jest.fn().mockResolvedValue(35),
      },
      redemptions: {
        findMany: jest.fn().mockResolvedValue([merchantRow]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      partner_discount_redemptions: {
        findMany: jest.fn().mockResolvedValue([partnerRow]),
        findFirst: jest.fn().mockResolvedValue(partnerRow),
        count: jest.fn().mockResolvedValue(1),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ monthly_count: 1n, count: 1n, rank: 1n }]),
    };

    service = new RedemptionsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as unknown as ConfigService,
      {} as any,
    );
  });

  describe('formatPartnerDiscountAsRedemption', () => {
    it('maps partner row into Flutter list/detail shape', () => {
      const list = service.formatPartnerDiscountAsRedemption(partnerRow, {
        includeOffer: false,
      });
      expect(list).toMatchObject({
        id: partnerRedemptionId,
        studentId: studentId,
        status: 'verified',
        verifiedBy: partnerRedemptionId,
        merchant: {
          businessName: 'Inside Karachi',
          logoPath:
            'https://insidekhi.sgp1.cdn.digitaloceanspaces.com/brand/inside-khi-logo-avatar.png',
        },

        branch: { branchName: "PRISMFEST'26 - 20 Oct" },
      });
      expect(list.offer).toBeUndefined();

      const detail = service.formatPartnerDiscountAsRedemption(partnerRow, {
        includeOffer: true,
      });
      expect(detail.offer).toEqual({
        id: partnerRedemptionId,
        title: "PRISMFEST'26 - 20 Oct",
        discountType: 'fixed',
        discountValue: 1199.8,
        imageUrl: null,
      });
    });
  });

  describe('getStudentRedemptions', () => {
    it('merges partner discounts ahead of older merchant rows', async () => {
      const result = await service.getStudentRedemptions(currentUser, {
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe(partnerRedemptionId);
      expect(result.items[0].merchant?.businessName).toBe('Inside Karachi');
      expect(result.items[1].id).toBe(merchantRedemptionId);
      expect(result.pagination.total).toBe(2);
      expect(prisma.partner_discount_redemptions.findMany).toHaveBeenCalled();
    });

    it('omits partner discounts when status=pending', async () => {
      prisma.redemptions.findMany.mockResolvedValue([]);
      prisma.redemptions.count.mockResolvedValue(0);

      const result = await service.getStudentRedemptions(currentUser, {
        status: 'pending',
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(0);
      expect(prisma.partner_discount_redemptions.findMany).not.toHaveBeenCalled();
    });

    it('omits partner discounts when merchantId filter is set', async () => {
      prisma.redemptions.findMany.mockResolvedValue([merchantRow]);
      prisma.redemptions.count.mockResolvedValue(1);

      await service.getStudentRedemptions(currentUser, {
        merchantId: '88888888-8888-8888-8888-888888888888',
        page: 1,
        limit: 10,
      });

      expect(prisma.partner_discount_redemptions.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getRedemptionById', () => {
    it('returns mapped partner discount when merchant row is missing', async () => {
      const result = await service.getRedemptionById(
        partnerRedemptionId,
        currentUser,
      );

      expect(result.id).toBe(partnerRedemptionId);
      expect(result.offer?.discountType).toBe('fixed');
      expect(result.offer?.discountValue).toBe(1199.8);
      expect(prisma.partner_discount_redemptions.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: partnerRedemptionId, student_id: studentId },
        }),
      );
    });

    it('404s when partner row is not owned by the student', async () => {
      prisma.partner_discount_redemptions.findFirst.mockResolvedValue(null);

      await expect(
        service.getRedemptionById(partnerRedemptionId, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids non-students', async () => {
      await expect(
        service.getRedemptionById(partnerRedemptionId, {
          id: userId,
          role: ROLES.ADMIN,
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getStudentRedemptionStats', () => {
    it('adds partner discount count to all-time totalRedemptions', async () => {
      const stats = await service.getStudentRedemptionStats(currentUser, 'alltime');

      expect(prisma.partner_discount_redemptions.count).toHaveBeenCalledWith({
        where: { student_id: studentId },
      });
      // lifetime_redemptions (32) + partner (1)
      expect(stats.totalRedemptions).toBe(33);
    });

    it('adds partner monthly count to monthly totalRedemptions', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ monthly_count: 2n }]) // merchant monthly
        .mockResolvedValueOnce([{ count: 1n }]) // partner monthly
        .mockResolvedValueOnce([{ rank: 5n }]) // rank
        .mockResolvedValueOnce([{ count: 0n }]); // bonuses

      const stats = await service.getStudentRedemptionStats(currentUser, 'monthly');

      expect(stats.totalRedemptions).toBe(3);
    });
  });
});
