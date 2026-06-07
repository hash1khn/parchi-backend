import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StudentsService } from './students.service';
import { PrismaService } from '../prisma/prisma.service';
import { SohoStrategy } from '../redemptions/strategies/soho.strategy';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';

describe('StudentsService (production readiness)', () => {
  let service: StudentsService;
  let prisma: {
    students: { findUnique: jest.Mock; update: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    selfie_change_requests: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let authService: { uploadStudentKycFile: jest.Mock };

  beforeEach(async () => {
    prisma = {
      students: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      selfie_change_requests: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    authService = {
      uploadStudentKycFile: jest.fn().mockResolvedValue('https://storage/selfie.jpg'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SohoStrategy, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get(StudentsService);
  });

  describe('submitSelfieChangeRequest', () => {
    it('rejects when a pending request already exists', async () => {
      prisma.students.findUnique.mockResolvedValue({
        id: 'student-1',
        users: { email: 'test@uni.edu' },
      });
      prisma.selfie_change_requests.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.submitSelfieChangeRequest('user-1', {
          buffer: Buffer.from('x'),
          mimetype: 'image/jpeg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a pending request when none exists', async () => {
      prisma.students.findUnique.mockResolvedValue({
        id: 'student-1',
        users: { email: 'test@uni.edu' },
      });
      prisma.selfie_change_requests.findFirst.mockResolvedValue(null);
      prisma.selfie_change_requests.create.mockResolvedValue({
        id: 'req-1',
        status: 'pending',
        created_at: new Date(),
      });

      const result = await service.submitSelfieChangeRequest('user-1', {
        buffer: Buffer.from('x'),
        mimetype: 'image/jpeg',
      });

      expect(result.status).toBe('pending');
      expect(prisma.selfie_change_requests.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            student_id: 'student-1',
            status: 'pending',
          }),
        }),
      );
    });
  });

  describe('resolveSelfieChangeRequest', () => {
    it('approves and updates verification_selfie_path', async () => {
      prisma.selfie_change_requests.findUnique.mockResolvedValue({
        id: 'req-1',
        student_id: 'student-1',
        new_selfie_path: 'https://storage/new.jpg',
        status: 'pending',
        students: { id: 'student-1' },
      });
      prisma.selfie_change_requests.update.mockResolvedValue({});
      prisma.students.update.mockResolvedValue({});

      const result = await service.resolveSelfieChangeRequest('req-1', 'approve');

      expect(result.status).toBe('approved');
      expect(prisma.students.update).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: { verification_selfie_path: 'https://storage/new.jpg' },
      });
    });

    it('throws when request not found', async () => {
      prisma.selfie_change_requests.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveSelfieChangeRequest('missing', 'approve'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLeaderboard monthly', () => {
    it('uses SQL pagination (count + limited rows)', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: BigInt(25) }])
        .mockResolvedValueOnce([
          {
            student_id: 's1',
            monthly_count: BigInt(5),
            first_name: 'Ali',
            last_name: 'Khan',
            parchi_id: 'PK001',
            university: 'LUMS',
            profile_picture: null,
          },
        ]);

      const result = await service.getLeaderboard(2, 10, 'monthly');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(result.pagination.total).toBe(25);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].rank).toBe(11);
      expect(result.items[0].redemptions).toBe(5);
    });
  });
});
