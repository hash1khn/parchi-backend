import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('AdminDashboardService (production readiness)', () => {
  let service: AdminDashboardService;
  let prisma: {
    student_kyc: { count: jest.Mock };
    students: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      student_kyc: { count: jest.fn().mockResolvedValue(3) },
      students: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: AnalyticsService, useValue: {} },
      ],
    }).compile();

    service = module.get(AdminDashboardService);
  });

  describe('getUserManagement', () => {
    it('counts rejected and deactivated approved/expired students separately', async () => {
      prisma.students.count
        .mockResolvedValueOnce(5)  // rejected
        .mockResolvedValueOnce(8); // suspended (deactivated approved/expired)

      const result = await (service as any).getUserManagement();

      expect(result.verificationQueue).toBe(3);
      expect(result.suspendedRejected).toBe(13);
      expect(prisma.students.count).toHaveBeenNthCalledWith(1, {
        where: { verification_status: 'rejected' },
      });
      expect(prisma.students.count).toHaveBeenNthCalledWith(2, {
        where: {
          verification_status: { in: ['approved', 'expired'] },
          users: { is_active: false },
        },
      });
    });
  });
});
