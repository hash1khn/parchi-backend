import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService (production readiness)', () => {
  let service: NotificationsService;
  let prisma: { students: { count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      students: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('getRecipientEstimate', () => {
    it('counts all approved active students for targetType=all', async () => {
      prisma.students.count.mockResolvedValue(1200);

      const result = await service.getRecipientEstimate('all');

      expect(result.count).toBe(1200);
      expect(prisma.students.count).toHaveBeenCalledWith({
        where: {
          verification_status: 'approved',
          users: { is_active: true },
        },
      });
    });

    it('filters by university when targetType=university', async () => {
      prisma.students.count.mockResolvedValue(42);

      const result = await service.getRecipientEstimate('university', 'LUMS');

      expect(result.count).toBe(42);
      expect(prisma.students.count).toHaveBeenCalledWith({
        where: {
          verification_status: 'approved',
          users: { is_active: true },
          university: 'LUMS',
        },
      });
    });

    it('filters founders club members', async () => {
      prisma.students.count.mockResolvedValue(7);

      const result = await service.getRecipientEstimate('founders_club');

      expect(result.count).toBe(7);
      expect(prisma.students.count).toHaveBeenCalledWith({
        where: {
          verification_status: 'approved',
          users: { is_active: true },
          is_founders_club: true,
        },
      });
    });
  });
});
