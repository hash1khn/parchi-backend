import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '@prisma/client';
import { CurrentUser } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { ROLES, VerificationStatus } from '../../constants/app.constants';
import { ApproveRejectStudentDto } from './dto/approve-reject-student.dto';
import { UpdateStudentAdminDto } from './dto/update-student-admin.dto';
import {
  calculatePaginationMeta,
  calculateSkip,
} from '../../utils/pagination.util';
import { PaginationMeta } from '../../utils/pagination.util';
import { SohoStrategy } from '../redemptions/strategies/soho.strategy';
import { generateParchiId } from '../../utils/parchi-id.util';

export interface StudentVerificationResponse {
  parchiId: string;
  firstName: string;
  lastName: string;
  university: string;
  verificationStatus: string;
  verificationSelfie: string | null;
  offers: {
    id: string;
    title: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    maxDiscountAmount: number | null;
    additionalItem?: string | null;
    isBonus: boolean;
  }[];
  merchantLogoUrl?: string | null;
  lastBranchRedemptionAt?: Date | null;
}

export interface StudentListResponse {
  id: string;
  userId: string;
  parchiId: string;
  firstName: string;
  lastName: string;
  email: string;
  emailConfirmed: boolean;
  phone: string | null;
  university: string;
  graduationYear: number | null;
  isFoundersClub: boolean;
  totalSavings: number;
  totalRedemptions: number;
  verificationStatus: string;
  verifiedAt: Date | null;
  verificationExpiresAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  cnic?: string;
  dateOfBirth?: Date | null;
  isActive: boolean;
  platform?: string | null;
  reviewNotes: string | null;
  instituteId?: string | null;
  instituteName?: string | null;
  studentIdNumber?: string | null;
  gender?: string | null;
  degree?: string | null;
  yearOfStudy?: string | null;
  adminNotes?: string | null;
  leaderboardRank?: number;
  accountAgeDays?: number;
  loyaltyProgress?: {
    merchantName: string;
    merchantLogo: string | null;
    current: number;
    goal: number;
    percentage: number;
  }[];
  recentRedemptions?: {
    id: string;
    date: Date | null;
    merchantName: string;
    branchName: string;
    offerTitle: string;
    isBonusApplied: boolean | null;
  }[];
}

export interface StudentKycResponse {
  id: string;
  userId: string;
  parchiId: string;
  firstName: string;
  lastName: string;
  email: string;
  emailConfirmed: boolean;
  phone: string | null;
  university: string;
  graduationYear: number | null;
  isFoundersClub: boolean;
  totalSavings: number;
  totalRedemptions: number;
  verificationStatus: string;
  verifiedAt: Date | null;
  verifiedBy: {
    id: string;
    email: string;
    role: string;
  } | null;
  verificationExpiresAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  cnic?: string;
  dateOfBirth?: Date | null;
  isActive: boolean;
  profilePicture?: string | null;
  verificationSelfiePath?: string | null;
  platform?: string | null;
  reviewNotes: string | null;
  instituteId?: string | null;
  instituteName?: string | null;
  studentIdNumber?: string | null;
  gender?: string | null;
  degree?: string | null;
  yearOfStudy?: string | null;
  adminNotes?: string | null;
  leaderboardRank?: number;
  accountAgeDays?: number;
  loyaltyProgress?: {
    merchantName: string;
    merchantLogo: string | null;
    current: number;
    goal: number;
    percentage: number;
  }[];
  recentRedemptions?: {
    id: string;
    date: Date | null;
    merchantName: string;
    branchName: string;
    offerTitle: string;
    isBonusApplied: boolean | null;
  }[];
  kyc?: {
    id: string;
    studentIdCardFrontPath: string;
    studentIdCardBackPath: string;
    cnicFrontImagePath?: string;
    cnicBackImagePath?: string;
    selfieImagePath: string;
    submittedAt: Date | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    isAnnualRenewal: boolean;
    createdAt: Date | null;
    reviewer?: {
      id: string;
      email: string;
    } | null;
  } | null;
}

export interface StudentDetailResponse extends StudentKycResponse {
  kyc: {
    id: string;
    studentIdCardFrontPath: string;
    studentIdCardBackPath: string;
    cnicFrontImagePath?: string;
    cnicBackImagePath?: string;
    selfieImagePath: string;
    submittedAt: Date | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    isAnnualRenewal: boolean;
    createdAt: Date | null;
    reviewer?: {
      id: string;
      email: string;
    } | null;
  } | null;
}

@Injectable()
export class StudentsService {
  // Constants
  private readonly ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  private readonly LOYALTY_BONUS_TITLE = 'Loyalty Bonus Reward';
  private readonly LOYALTY_BONUS_DESCRIPTION = `Congratulations! You've unlocked a loyalty bonus.`;
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sohoStrategy: SohoStrategy,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) { }

  /**
   * Get pending approval students
   * Admin only
   * Returns list without KYC data for better performance
   */
  async getPendingApprovalStudents(
    page: number = 1,
    limit: number = 12,
    sort: 'asc' | 'desc' = 'asc',
  ): Promise<{ items: StudentListResponse[]; pagination: PaginationMeta }> {
    const skip = calculateSkip(page, limit);
    const verifiedEmailWhere: Prisma.studentsWhereInput = {
      users: {
        is: {
          users: {
            is: {
              email_confirmed_at: {
                not: null,
              },
            },
          },
        },
      },
    };

    const [students, total] = await Promise.all([
      this.prisma.students.findMany({
        where: {
          verification_status: 'pending',
          ...verifiedEmailWhere,
        },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              phone: true,
              is_active: true,
            },
          },
          // KYC data excluded for list view - use getStudentDetailsForReview for full details
        },
        orderBy: {
          created_at: sort,
        },
        skip,
        take: limit,
      }),
      this.prisma.students.count({
        where: {
          verification_status: 'pending',
          ...verifiedEmailWhere,
        },
      }),
    ]);

    // Batch fetch inferred platforms for students who have null platform
    const studentsWithNullPlatform = students.filter(s => !s.platform);
    const inferredPlatforms = new Map<string, string>();

    if (studentsWithNullPlatform.length > 0) {
      const userIds = studentsWithNullPlatform.map(s => s.user_id);
      
      // 1. Try FCM Tokens
      const fcmTokens = await this.prisma.user_fcm_tokens.findMany({
        where: { 
          user_id: { in: userIds }, 
          platform: { not: null, notIn: ['unknown', 'undefined', ''] } 
        },
        orderBy: { updated_at: 'desc' },
        select: { user_id: true, platform: true }
      });
      
      fcmTokens.forEach(t => {
        if (t.platform && !inferredPlatforms.has(t.user_id)) {
          inferredPlatforms.set(t.user_id, t.platform);
        }
      });

      // 2. Try Analytics Events for remaining
      const remainingUserIds = userIds.filter(id => !inferredPlatforms.has(id));
      if (remainingUserIds.length > 0) {
        const events = await this.prisma.analytics_events.findMany({
          where: { 
            user_id: { in: remainingUserIds }, 
            platform: { not: null, notIn: ['unknown', 'undefined', ''] } 
          },
          orderBy: { created_at: 'desc' },
          select: { user_id: true, platform: true }
        });
        
        events.forEach(e => {
          if (e.user_id && e.platform && !inferredPlatforms.has(e.user_id)) {
            inferredPlatforms.set(e.user_id, e.platform);
          }
        });
      }
    }



    const formattedStudents = await Promise.all(
      students.map((student) => {
        const inferredPlatform = inferredPlatforms.get(student.user_id);
        return this.formatStudentListResponse(student, inferredPlatform);
      }),
    );

    return {
      items: formattedStudents,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }

  /**
   * Get all students
   * Admin only
   */
  async getAllStudents(
    status?: VerificationStatus,
    page: number = 1,
    limit: number = 12,
    search?: string,
    institute?: string,
    emailVerified?: string,
    groupBy?: 'university' | 'city',
    university?: string,
    gender?: string,
    kycStatus?: string,
    minRedemptions?: number,
    maxRedemptions?: number,
    dateFrom?: string,
    dateTo?: string,
    hasRedeemed?: string,
    foundersClub?: string,
  ): Promise<{ items: any[]; pagination: PaginationMeta }> {
    if (groupBy) {
      return this.getStudentSegmentation(groupBy);
    }

    const skip = calculateSkip(page, limit);
    const whereClause: Prisma.studentsWhereInput = {};
    const conditions: Prisma.studentsWhereInput[] = [];

    if (emailVerified !== undefined) {
      const isVerified = emailVerified === 'true';
      conditions.push({
        users: {
          users: isVerified 
            ? { email_confirmed_at: { not: null } }
            : { email_confirmed_at: null }
        },
      });
    }

    // Handle KYC Status (supporting multi-select comma separated)
    if (kycStatus) {
      const statusList = kycStatus.split(',').map(s => s.trim());
      const enumStatuses = statusList.filter(s => s !== 'suspended') as VerificationStatus[];
      const hasSuspended = statusList.includes('suspended');

      const kycConditions: Prisma.studentsWhereInput[] = [];
      if (enumStatuses.length > 0) {
        kycConditions.push({ verification_status: { in: enumStatuses } });
      }
      if (hasSuspended) {
        kycConditions.push({ users: { is_active: false } });
      }
      
      if (kycConditions.length > 0) {
        conditions.push({ OR: kycConditions });
      }
    } else if (status) {
      conditions.push({ verification_status: status });
    }

    // University filter (checking both institute and university fields for compatibility)
    if (university || institute) {
      conditions.push({
        university: {
          contains: university || institute,
          mode: 'insensitive',
        },
      });
    }

    if (gender) {
      conditions.push({ gender: { equals: gender, mode: 'insensitive' } });
    }

    // Redemption range
    if (minRedemptions !== undefined) {
      conditions.push({ lifetime_redemptions: { gte: minRedemptions } });
    }
    if (maxRedemptions !== undefined) {
      conditions.push({ lifetime_redemptions: { lte: maxRedemptions } });
    }

    // Date joined range
    if (dateFrom || dateTo) {
      const dateCond: Prisma.DateTimeFilter = {};
      if (dateFrom) dateCond.gte = new Date(dateFrom);
      if (dateTo) dateCond.lte = new Date(dateTo);
      conditions.push({ created_at: dateCond });
    }

    // Has redeemed toggle
    if (hasRedeemed !== undefined) {
      if (hasRedeemed === 'true') {
        conditions.push({ lifetime_redemptions: { gt: 0 } });
      } else if (hasRedeemed === 'false') {
        conditions.push({ lifetime_redemptions: 0 });
      }
    }

    // Founders Club toggle
    if (foundersClub !== undefined) {
      conditions.push({ is_founders_club: foundersClub === 'true' });
    }

    if (search) {
      conditions.push({
        OR: [
          { first_name: { contains: search, mode: 'insensitive' } },
          { last_name: { contains: search, mode: 'insensitive' } },
          { parchi_id: { contains: search, mode: 'insensitive' } },
          {
            users: {
              email: { contains: search, mode: 'insensitive' },
            },
          },
          {
            users: {
              phone: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    if (conditions.length > 0) {
      whereClause.AND = conditions;
    }

    const [students, total] = await Promise.all([
      this.prisma.students.findMany({
        where: whereClause,
        include: {
          users: {
            select: {
              id: true,
              email: true,
              phone: true,
              is_active: true,
              users: {
                select: {
                  email_confirmed_at: true,
                }
              }
            },
          },
          verified_by_user: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
          student_kyc: {
            orderBy: {
              submitted_at: 'desc',
            },
            take: 1, // Get the latest KYC submission
            include: {
              users: {
                select: {
                  email: true,
                }
              }
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.students.count({
        where: whereClause,
      }),
    ]);

    // Batch fetch inferred platforms for students who have null platform
    const studentsWithNullPlatform = students.filter(s => !s.platform);
    const inferredPlatforms = new Map<string, string>();

    if (studentsWithNullPlatform.length > 0) {
      const userIds = studentsWithNullPlatform.map(s => s.user_id);
      
      // 1. Try FCM Tokens
      const fcmTokens = await this.prisma.user_fcm_tokens.findMany({
        where: { 
          user_id: { in: userIds }, 
          platform: { not: null, notIn: ['unknown', 'undefined', ''] } 
        },
        orderBy: { updated_at: 'desc' },
        select: { user_id: true, platform: true }
      });
      
      fcmTokens.forEach(t => {
        if (t.platform && !inferredPlatforms.has(t.user_id)) {
          inferredPlatforms.set(t.user_id, t.platform);
        }
      });

      // 2. Try Analytics Events for remaining
      const remainingUserIds = userIds.filter(id => !inferredPlatforms.has(id));
      if (remainingUserIds.length > 0) {
        const events = await this.prisma.analytics_events.findMany({
          where: { 
            user_id: { in: remainingUserIds }, 
            platform: { not: null, notIn: ['unknown', 'undefined', ''] } 
          },
          orderBy: { created_at: 'desc' },
          select: { user_id: true, platform: true }
        });
        
        events.forEach(e => {
          if (e.user_id && e.platform && !inferredPlatforms.has(e.user_id)) {
            inferredPlatforms.set(e.user_id, e.platform);
          }
        });
      }
    }



    const formattedStudents = await Promise.all(
      students.map((student) => {
        const inferredPlatform = inferredPlatforms.get(student.user_id);
        return this.formatStudentResponse(student, inferredPlatform);
      }),
    );

    return {
      items: formattedStudents,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }

  /**
   * Get student verification details by Parchi ID
   * For merchant branches to verify student identity during redemption
   * Returns minimal information needed for verification
   */
  async getStudentByParchiId(
    parchiId: string,
    currentUser: CurrentUser,
  ): Promise<StudentVerificationResponse> {
    // Early validation
    if (currentUser.role !== ROLES.MERCHANT_BRANCH || !currentUser.branch_id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    const branchId = currentUser.branch_id;
    const merchantId = currentUser.merchant_id;
    if (!merchantId) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    // Normalize parchi ID (uppercase, trim)
    const inputParchiId = parchiId.trim().toUpperCase();
    
    // Get student first (required for subsequent queries)
    const student = await this.prisma.students.findUnique({
      where: { parchi_id: inputParchiId },
      select: {
        id: true,
        parchi_id: true,
        first_name: true,
        last_name: true,
        university: true,
        verification_status: true,
        verification_selfie_path: true,
      },
    });
    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }
    // Parallelize independent queries for better performance
    const now = new Date();
    const [studentMerchantStats, studentOfferStats, loyaltyPrograms, branchOffers, lastRedemption] = await Promise.all([
      // 1. Get student merchant-wide stats
      (this.prisma as any).student_merchant_stats.findUnique({
        where: {
          student_id_merchant_id: {
            student_id: student.id,
            merchant_id: merchantId,
          },
        },
        select: { redemption_count: true },
      }),
      // 2. Get student offer-specific stats
      (this.prisma as any).student_offer_stats.findMany({
        where: {
          student_id: student.id,
          offers: { merchant_id: merchantId }
        },
        select: { offer_id: true, redemption_count: true }
      }),
      // 3. Get all active loyalty programs for this merchant
      (this.prisma as any).loyalty_programs.findMany({
        where: {
          merchant_id: merchantId,
          is_active: true
        }
      }),
      // 4. Get all active offers for the merchant (available to all its branches)
      this.prisma.offers.findMany({
        where: {
          merchant_id: merchantId,
          status: 'active',
          valid_from: { lte: now },
          valid_until: { gte: now },
        },
        orderBy: { created_at: 'desc' },
      }),
      // 5. Get last redemption at this branch
      this.prisma.redemptions.findFirst({
        where: {
          student_id: student.id,
          branch_id: branchId,
        },
        orderBy: {
          created_at: 'desc',
        },
        select: {
          created_at: true,
        },
      }),
    ]);

    // Map offer stats for easy lookup
    const offerStatsMap = new Map(studentOfferStats.map(s => [s.offer_id, s.redemption_count]));

    // Determine applicable offers
    const offers = await Promise.all(branchOffers.map(async (offer) => {
      let strategyDiscount: number | null = null;
      let strategyNote: string | null = null;

      if (offer.redemption_strategy === 'soho_hierarchical') {
        const result = await this.sohoStrategy.calculateDiscount({
          studentId: student.id,
          merchantId: merchantId,
          offerId: offer.id,
          tx: this.prisma,
        });
        strategyDiscount = result.discountValue;
        strategyNote = result.note ?? null;
      }

      const currentOfferRedemptions = (offerStatsMap.get(offer.id) as any) ?? 0;
      const currentMerchantRedemptions = (studentMerchantStats as any)?.redemption_count ?? 0;

      return this.determineOfferStatus(
        offer,
        currentMerchantRedemptions,
        currentOfferRedemptions,
        loyaltyPrograms,
        strategyDiscount,
        strategyNote
      );
    }));

    return {
      parchiId: student.parchi_id || parchiId,
      firstName: student.first_name,
      lastName: student.last_name,
      university: student.university,
      verificationStatus: student.verification_status || 'pending',
      verificationSelfie: student.verification_selfie_path,
      offers: offers.filter(o => o !== null),
      lastBranchRedemptionAt: lastRedemption?.created_at || null,
    };
  }

  /**
   * Determine the status of a specific offer for a student
   */
  private determineOfferStatus(
    offer: any,
    merchantRedemptions: number,
    offerRedemptions: number,
    loyaltyPrograms: any[],
    strategyDiscount?: number | null,
    strategyNote?: string | null,
  ) {
    // Strategy Override
    if (strategyDiscount !== null && strategyDiscount !== undefined) {
      return {
        id: offer.id,
        title: offer.title,
        description: strategyNote || offer.description,
        discountType: offer.discount_type,
        discountValue: strategyDiscount,
        maxDiscountAmount: offer.max_discount_amount ? Number(offer.max_discount_amount) : null,
        isBonus: true,
      };
    }

    // Priority: 1. Offer-specific program, 2. Merchant-wide program
    const offerProgram = loyaltyPrograms.find(p => p.scope === 'offer' && p.offer_id === offer.id);
    const merchantProgram = loyaltyPrograms.find(p => p.scope === 'merchant');

    const activeProgram = offerProgram || merchantProgram;

    if (activeProgram) {
      const redemptions = activeProgram.scope === 'offer' ? offerRedemptions : merchantRedemptions;
      const isBonus = (redemptions + 1) % activeProgram.redemptions_required === 0;

      if (isBonus) {
        return {
          id: offer.id,
          title: activeProgram.scope === 'offer' ? `${offer.title} (Bonus)` : "Loyalty Bonus",
          description: offer.description,
          discountType: activeProgram.discount_type,
          discountValue: Number(activeProgram.discount_value),
          maxDiscountAmount: activeProgram.max_discount_amount ? Number(activeProgram.max_discount_amount) : null,
          additionalItem: activeProgram.additional_item,
          isBonus: true,
        };
      }
    }

    return {
      id: offer.id,
      title: offer.title,
      description: offer.description,
      discountType: offer.discount_type,
      discountValue: Number(offer.discount_value),
      maxDiscountAmount: offer.max_discount_amount ? Number(offer.max_discount_amount) : null,
      additionalItem: offer.additional_item,
      isBonus: false,
    };
  }

  /**
   * Get student details by ID for review
   * Admin only
   */
  async getStudentDetailsForReview(
    id: string,
  ): Promise<StudentDetailResponse> {
    const student = await this.prisma.students.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            phone: true,
            is_active: true,
          },
        },
        verified_by_user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        institutes: {
          select: { id: true, name: true },
        },
        student_kyc: {
          orderBy: {
            submitted_at: 'desc',
          },
          take: 1,
          include: {
            users: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    let inferredPlatform: string | undefined = undefined;
    if (!student.platform) {
      inferredPlatform = (await this.getInferredPlatform(student.user_id)) || undefined;
    }

    return this.formatStudentDetailResponse(student, inferredPlatform);
  }

  /**
   * Update student profile and account fields (admin). Parchi ID cannot be changed.
   */
  async updateStudentByAdmin(
    id: string,
    dto: UpdateStudentAdminDto,
  ): Promise<StudentDetailResponse> {
    const dtoKeys = Object.keys(dto) as (keyof UpdateStudentAdminDto)[];
    if (!dtoKeys.some((k) => dto[k] !== undefined)) {
      throw new BadRequestException('No fields to update');
    }

    const student = await this.prisma.students.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    const userUpdates: Prisma.public_usersUpdateInput = {};

    if (dto.email !== undefined) {
      const normalized = dto.email.trim().toLowerCase();
      if (normalized !== student.users.email.toLowerCase()) {
        const conflict = await this.prisma.public_users.findFirst({
          where: {
            email: normalized,
            NOT: { id: student.user_id },
          },
        });
        if (conflict) {
          throw new ConflictException('Email already in use');
        }
        const admin = this.authService.getAdminSupabaseClient();
        const { error } = await admin.auth.admin.updateUserById(student.user_id, {
          email: normalized,
        });
        if (error) {
          throw new BadRequestException(
            error.message || 'Failed to update email in auth provider',
          );
        }
        userUpdates.email = normalized;
      }
    }

    if (dto.phone !== undefined) {
      userUpdates.phone = dto.phone === '' ? null : dto.phone;
    }

    if (dto.isActive !== undefined) {
      userUpdates.is_active = dto.isActive;
    }

    const studentUpdates: Prisma.studentsUncheckedUpdateInput = {};

    if (dto.firstName !== undefined) {
      studentUpdates.first_name = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      studentUpdates.last_name = dto.lastName;
    }
    if (dto.university !== undefined) {
      studentUpdates.university = dto.university;
    }
    if (dto.graduationYear !== undefined) {
      studentUpdates.graduation_year = dto.graduationYear;
    }
    if (dto.isFoundersClub !== undefined) {
      studentUpdates.is_founders_club = dto.isFoundersClub;
    }
    if (dto.totalSavings !== undefined) {
      studentUpdates.total_savings = dto.totalSavings;
    }
    if (dto.totalRedemptions !== undefined) {
      studentUpdates.total_redemptions = dto.totalRedemptions;
      studentUpdates.lifetime_redemptions = dto.totalRedemptions;
    }
    if (dto.verificationStatus !== undefined) {
      studentUpdates.verification_status = dto.verificationStatus;
    }
    if (dto.gender !== undefined) {
      studentUpdates.gender = dto.gender;
    }
    if (dto.degree !== undefined) {
      studentUpdates.degree = dto.degree;
    }
    if (dto.yearOfStudy !== undefined) {
      studentUpdates.year_of_study = dto.yearOfStudy;
    }
    if (dto.notes !== undefined) {
      studentUpdates.admin_notes = dto.notes;
    }
    if (dto.verificationExpiresAt !== undefined) {
      studentUpdates.verification_expires_at =
        dto.verificationExpiresAt === null ||
          dto.verificationExpiresAt === ''
          ? null
          : new Date(dto.verificationExpiresAt);
    }
    if (dto.instituteId !== undefined) {
      studentUpdates.institute_id = dto.instituteId === null ? null : dto.instituteId;
    }
    if (dto.studentIdNumber !== undefined) {
      const nextIdNum = dto.studentIdNumber === '' ? null : dto.studentIdNumber;
      if (nextIdNum) {
        // Only check uniqueness when both fields are available
        const resolvedInstituteId =
          dto.instituteId !== undefined ? dto.instituteId : student.institute_id;
        if (resolvedInstituteId) {
          const taken = await this.prisma.students.findFirst({
            where: {
              institute_id: resolvedInstituteId,
              student_id_number: nextIdNum,
              NOT: { id },
            },
          });
          if (taken) {
            throw new ConflictException(
              'Student ID Number already registered at this institute',
            );
          }
        }
      }
      studentUpdates.student_id_number = nextIdNum;
    }
    if (dto.dateOfBirth !== undefined) {
      studentUpdates.date_of_birth =
        !dto.dateOfBirth || dto.dateOfBirth === ''
          ? null
          : new Date(dto.dateOfBirth);
    }
    if (dto.profilePicture !== undefined) {
      studentUpdates.profile_picture =
        dto.profilePicture === '' ? null : dto.profilePicture;
    }
    if (dto.verificationSelfiePath !== undefined) {
      studentUpdates.verification_selfie_path =
        dto.verificationSelfiePath === '' ? null : dto.verificationSelfiePath;
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userUpdates).length > 0) {
        await tx.public_users.update({
          where: { id: student.user_id },
          data: {
            ...userUpdates,
            updated_at: new Date(),
          },
        });
      }
      if (Object.keys(studentUpdates).length > 0) {
        await tx.students.update({
          where: { id },
          data: {
            ...studentUpdates,
            updated_at: new Date(),
          },
        });
      }
    });

    return this.getStudentDetailsForReview(id);
  }

  async updateStudentSelfie(
    id: string,
    file: { buffer: Buffer; mimetype?: string },
  ): Promise<{ selfieImageUrl: string }> {
    const student = await this.prisma.students.findUnique({
      where: { id },
      include: { users: true }
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    const signupKey = student.users.email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');

    const selfieImageUrl = await this.authService.uploadStudentKycFile(
      file,
      'selfie-updates',
      signupKey,
    );

    await this.prisma.students.update({
      where: { id },
      data: { verification_selfie_path: selfieImageUrl }
    });

    // Also update the latest KYC record if it exists
    const latestKyc = await this.prisma.student_kyc.findFirst({
      where: { student_id: id },
      orderBy: { created_at: 'desc' }
    });

    if (latestKyc) {
      await this.prisma.student_kyc.update({
        where: { id: latestKyc.id },
        data: { selfie_image_path: selfieImageUrl }
      });
    }

    return { selfieImageUrl };
  }

  /**
   * Manually verify student email (bypass)
   * Admin only
   */
  async verifyStudentEmail(id: string): Promise<StudentDetailResponse> {
    const student = await this.prisma.students.findUnique({
      where: { id },
      select: { user_id: true },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    const authClient = this.authService.getAdminSupabaseClient();
    const { error } = await authClient.auth.admin.updateUserById(student.user_id, {
      email_confirm: true,
    });

    if (error) {
      throw new BadRequestException(
        error.message || 'Failed to verify email in auth provider',
      );
    }

    return this.getStudentDetailsForReview(id);
  }

  /**
   * Delete student and linked public user.
   * Deleting public_users cascades to students and dependent student records.
   */
  async deleteStudentByAdmin(id: string): Promise<null> {
    const student = await this.prisma.students.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
      },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.audit_logs.updateMany({
        where: { user_id: student.user_id },
        data: { user_id: null },
      });

      await tx.public_users.delete({
        where: { id: student.user_id },
      });
    });

    return null;
  }

  /**
   * Approve or reject student
   * Admin only
   */
  async approveRejectStudent(
    id: string,
    approveRejectDto: ApproveRejectStudentDto,
    reviewerId: string,
  ): Promise<StudentKycResponse> {
    if (approveRejectDto.action === 'approve') {
      if (!approveRejectDto.instituteId || !approveRejectDto.studentIdNumber) {
        throw new BadRequestException('Institute and Student ID Number are required for approval');
      }
      const idNumTrimmed = approveRejectDto.studentIdNumber.trim();
      if (!idNumTrimmed) {
        throw new BadRequestException('Student ID Number cannot be empty');
      }
      // Check uniqueness of (institute_id, student_id_number)
      const existing = await this.prisma.students.findFirst({
        where: {
          institute_id: approveRejectDto.instituteId,
          student_id_number: idNumTrimmed,
          NOT: { id },
        },
      });
      if (existing) {
        throw new ConflictException('A student with this Student ID is already registered at this institute');
      }
    }

    const student = await this.prisma.students.findUnique({

      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            phone: true,
          },
        },
        student_kyc: {
          where: {
            reviewed_at: null, // Get the latest unreviewed KYC
          },
          orderBy: {
            submitted_at: 'desc',
          },
          take: 1,
        },
      },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    const verificationStatus =
      approveRejectDto.action === 'approve' ? 'approved' : 'rejected';
    const isActive = approveRejectDto.action === 'approve';
    const now = new Date();

    // Generate Parchi ID if approving and not yet assigned
    let parchiIdToUpdate: string | undefined;
    if (approveRejectDto.action === 'approve' && !student.parchi_id) {
      parchiIdToUpdate = await generateParchiId(this.prisma);
    }

    // Use transaction to ensure all updates happen atomically
    await this.prisma.$transaction(async (tx) => {
      // Get KYC selfie path if available and approving
      const latestKyc = student.student_kyc.length > 0 ? student.student_kyc[0] : null;

      if (approveRejectDto.action === 'approve') {
        // Automatically verify email when approving KYC if not already verified
        const authClient = this.authService.getAdminSupabaseClient();
        await authClient.auth.admin.updateUserById(student.user_id, {
          email_confirm: true,
        });
      }
      const selfiePath =
        approveRejectDto.action === 'approve' && latestKyc
          ? latestKyc.selfie_image_path
          : undefined;

      // 1. Update student verification status and save selfie if approving
      await tx.students.update({
        where: { id: student.id },
        data: {
          verification_status: verificationStatus,
          verified_at: now,
          // Track which admin approved the student
          verified_by: approveRejectDto.action === 'approve' ? reviewerId : null,
          // Set expiration date to 1 year from now if approved
          verification_expires_at:
            approveRejectDto.action === 'approve'
              ? new Date(now.getTime() + this.ONE_YEAR_MS)
              : null,
          // Save selfie image from KYC before deleting it
          ...(selfiePath && { verification_selfie_path: selfiePath }),
      // Assign Parchi ID if newly generated
      ...(parchiIdToUpdate && { parchi_id: parchiIdToUpdate }),
      // Assign institute and student ID number from admin input
      ...(approveRejectDto.action === 'approve' && approveRejectDto.instituteId && { institute_id: approveRejectDto.instituteId }),
      ...(approveRejectDto.action === 'approve' && approveRejectDto.studentIdNumber && { student_id_number: approveRejectDto.studentIdNumber }),
    },
  });


      // 2. Update user is_active status
      await tx.public_users.update({
        where: { id: student.user_id },
        data: {
          is_active: isActive,
        },
      });

      // 3. Handle KYC record — preserve ID card paths for future selfie-change review
      if (latestKyc) {
        await tx.student_kyc.update({
          where: { id: latestKyc.id },
          data: {
            reviewed_by: reviewerId,
            reviewed_at: now,
            review_notes: approveRejectDto.reviewNotes || null,
          },
        });
      }
    }, {
      timeout: 20000, // Increase timeout to 20 seconds
    });

    // Return updated student with relations (fetched outside transaction)
    const result = await this.prisma.students.findUnique({
      where: { id: student.id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            phone: true,
          },
        },
        student_kyc: {
          orderBy: {
            submitted_at: 'desc',
          },
          take: 1,
          include: {
            users: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!result) {
      throw new Error('Student not found after update');
    }

    try {
      if (approveRejectDto.action === 'approve') {
        await this.mailService.sendStudentApprovedEmail(
          result.users.email,
          result.first_name,
          result.parchi_id!,
        );
      } else {
        await this.mailService.sendStudentRejectedEmail(
          result.users.email,
          result.first_name,
          approveRejectDto.reviewNotes || 'Does not meet requirements',
        );
      }
    } catch (emailError: any) {
      // Log but never block the approval flow
      this.logger.error(
        `Failed to send ${approveRejectDto.action} email to ${result.users.email}: ${emailError?.message}`,
        emailError?.stack,
      );
    }

    return this.formatStudentResponse(result);
  }

  /**
   * Toggle student status (active/inactive)
   * Admin only
   */
  async toggleStudentStatus(
    id: string,
    isActive: boolean,
    reason?: string,
  ): Promise<StudentKycResponse> {
    const student = await this.prisma.students.findUnique({
      where: { id },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    // Update user is_active status
    await this.prisma.public_users.update({
      where: { id: student.user_id },
      data: {
        is_active: isActive,
        deactivation_reason: isActive ? null : reason,
      },
    });

    // Validated student fetching to return full response
    const updatedStudent = await this.prisma.students.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            phone: true,
            is_active: true,
            deactivation_reason: true,
          },
        },
        verified_by_user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        student_kyc: {
          orderBy: {
            submitted_at: 'desc',
          },
          take: 1,
          include: {
            users: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return this.formatStudentResponse(updatedStudent!);
  }

  /**
   * Get student segmentation by university or city
   */
  private async getStudentSegmentation(groupBy: 'university' | 'city' = 'university') {
    const students = await this.prisma.students.findMany({
      select: {
        university: true,
        verification_status: true,
      },
    });

    const groups = new Map<string, any>();

    students.forEach(s => {
      let key = s.university || 'Other';
      if (groupBy === 'city' && s.university) {
        const parts = s.university.split(',');
        key = parts.length > 1 ? parts[parts.length - 1].trim() : 'Other';
      }

      if (!groups.has(key)) {
        groups.set(key, {
          group: key,
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        });
      }

      const group = groups.get(key);
      group.total++;
      if (s.verification_status === 'pending') group.pending++;
      if (s.verification_status === 'approved') group.approved++;
      if (s.verification_status === 'rejected') group.rejected++;
    });

    const items = Array.from(groups.values()).sort((a, b) => b.total - a.total);

    return {
      items,
      pagination: {
        total: items.length,
        page: 1,
        pages: 1,
        limit: items.length,
        hasNext: false,
        hasPrev: false,
      },
    };
  }

  /**
   * Format student list response (without KYC data)
   */
  private async formatStudentListResponse(student: any, inferredPlatform?: string): Promise<StudentListResponse> {
    let platform = student.platform || inferredPlatform;
    if (!platform) {
      platform = await this.getInferredPlatform(student.user_id) || undefined;
    }

    return {
      id: student.id,
      userId: student.user_id,
      parchiId: student.parchi_id || 'PENDING',
      firstName: student.first_name,
      lastName: student.last_name,
      email: student.users.email,
      phone: student.users.phone,
      university: student.university,
      graduationYear: student.graduation_year,
      isFoundersClub: student.is_founders_club,
      totalSavings: Number(student.total_savings || 0),
      totalRedemptions: student.lifetime_redemptions || 0,
      verificationStatus: student.verification_status,
      verifiedAt: student.verified_at,
      verificationExpiresAt: student.verification_expires_at,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
      emailConfirmed: await this.getEmailConfirmedStatus(student.user_id),
      cnic: student.cnic,
      dateOfBirth: student.date_of_birth,
      isActive: student.users.is_active ?? false,
      platform,
      reviewNotes: student.student_kyc?.[0]?.review_notes || null,
      instituteId: student.institute_id ?? null,
      instituteName: student.institutes?.name ?? null,
      studentIdNumber: student.student_id_number ?? null,
    };
  }

  /**
   * Format student response with KYC data
   */
  private async formatStudentResponse(student: any, inferredPlatform?: string): Promise<StudentKycResponse> {
    const latestKyc = student.student_kyc?.[0] || null;

    let platform = student.platform || inferredPlatform;
    if (!platform) {
      platform = await this.getInferredPlatform(student.user_id) || undefined;
    }

    return {
      id: student.id,
      userId: student.user_id,
      parchiId: student.parchi_id || 'PENDING',
      firstName: student.first_name,
      lastName: student.last_name,
      email: student.users.email,
      phone: student.users.phone,
      university: student.university,
      graduationYear: student.graduation_year,
      isFoundersClub: student.is_founders_club,
      totalSavings: Number(student.total_savings || 0),
      totalRedemptions: student.lifetime_redemptions || 0,
      verificationStatus: student.verification_status,
      verifiedAt: student.verified_at,
      verifiedBy: student.verified_by_user
        ? {
          id: student.verified_by_user.id,
          email: student.verified_by_user.email,
          role: student.verified_by_user.role,
        }
        : null,
      verificationExpiresAt: student.verification_expires_at,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
      kyc: latestKyc
        ? {
          id: latestKyc.id,
          studentIdCardFrontPath: latestKyc.student_id_card_front_path,
          studentIdCardBackPath: latestKyc.student_id_card_back_path,
          cnicFrontImagePath: latestKyc.cnic_front_image_path,
          cnicBackImagePath: latestKyc.cnic_back_image_path,
          selfieImagePath: latestKyc.selfie_image_path,
          submittedAt: latestKyc.submitted_at,
          reviewedBy: latestKyc.reviewed_by,
          reviewedAt: latestKyc.reviewed_at,
          reviewNotes: latestKyc.review_notes,
          isAnnualRenewal: latestKyc.is_annual_renewal,
          createdAt: latestKyc.created_at,
          reviewer: latestKyc.users
            ? {
              id: latestKyc.users.id,
              email: latestKyc.users.email,
            }
            : null,
        }
        : null,
      emailConfirmed: await this.getEmailConfirmedStatus(student.user_id),
      cnic: student.cnic,
      dateOfBirth: student.date_of_birth,
      isActive: student.users.is_active ?? false,
      profilePicture: student.profile_picture ?? null,
      verificationSelfiePath: student.verification_selfie_path ?? null,
      platform,
      reviewNotes: latestKyc?.review_notes || null,
      instituteId: student.institute_id ?? null,
      instituteName: student.institutes?.name ?? null,
      studentIdNumber: student.student_id_number ?? null,
    };
  }

  /**
   * Format student detail response
   */
  private async formatStudentDetailResponse(student: any, inferredPlatform?: string): Promise<StudentDetailResponse> {
    const latestKyc = student.student_kyc?.[0] || null;

    let platform = student.platform || inferredPlatform;
    if (!platform) {
      platform = await this.getInferredPlatform(student.user_id) || undefined;
    }

    // Get loyalty progress across all merchants
    const loyaltyProgress = await this.prisma.student_merchant_stats.findMany({
      where: { student_id: student.id },
      include: {
        merchants: {
          include: {
            loyalty_programs: {
              where: { is_active: true, scope: 'merchant' },
              take: 1
            }
          }
        }
      }
    });

    const formattedLoyalty = loyaltyProgress
      .filter(stat => stat.merchants.loyalty_programs.length > 0)
      .map(stat => {
        const prog = stat.merchants.loyalty_programs[0];
        const req = prog.redemptions_required || 5;
        const current = (stat.redemption_count || 0) % req;
        return {
          merchantName: stat.merchants.business_name,
          merchantLogo: stat.merchants.logo_path,
          current,
          goal: req,
          percentage: Math.min(100, (current / req) * 100)
        };
      });

    // Get last 5 redemptions for timeline
    const recentRedemptions = await this.prisma.redemptions.findMany({
      where: { student_id: student.id },
      take: 5,
      orderBy: { created_at: 'desc' },
      include: {
        merchant_branches: {
          select: { branch_name: true, merchants: { select: { business_name: true } } }
        },
        offers: { select: { title: true } }
      }
    });

    const formattedRedemptions = recentRedemptions.map((r: any) => ({
      id: r.id,
      date: r.created_at,
      merchantName: r.merchant_branches.merchants.business_name,
      branchName: r.merchant_branches.branch_name,
      offerTitle: r.offers.title,
      isBonusApplied: r.is_bonus_applied
    }));

    // Get leaderboard rank (simplified for now)
    const rank = await this.prisma.students.count({
      where: {
        verification_status: 'approved',
        OR: [
          {
            lifetime_redemptions: {
              gt: student.lifetime_redemptions || 0,
            },
          },
          {
            lifetime_redemptions: student.lifetime_redemptions || 0,
            last_redemption_at: {
              gt: student.last_redemption_at || new Date(0),
            },
          },
          {
            lifetime_redemptions: student.lifetime_redemptions || 0,
            last_redemption_at: student.last_redemption_at || new Date(0),
            id: {
              lt: student.id,
            },
          },
        ],
      },
    }) + 1;

    return {
      id: student.id,
      userId: student.user_id,
      parchiId: student.parchi_id || 'PENDING',
      firstName: student.first_name,
      lastName: student.last_name,
      email: student.users.email,
      phone: student.users.phone,
      university: student.university,
      graduationYear: student.graduation_year,
      gender: student.gender,
      degree: student.degree,
      yearOfStudy: student.year_of_study,
      adminNotes: student.admin_notes,
      isFoundersClub: student.is_founders_club,
      totalSavings: Number(student.total_savings || 0),
      totalRedemptions: student.lifetime_redemptions || 0,
      leaderboardRank: rank,
      accountAgeDays: Math.floor((Date.now() - new Date(student.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      verificationStatus: student.verification_status,
      verifiedAt: student.verified_at,
      verifiedBy: student.verified_by_user
        ? {
          id: student.verified_by_user.id,
          email: student.verified_by_user.email,
          role: student.verified_by_user.role,
        }
        : null,
      verificationExpiresAt: student.verification_expires_at,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
      loyaltyProgress: formattedLoyalty,
      recentRedemptions: formattedRedemptions,
      kyc: latestKyc
        ? {
          id: latestKyc.id,
          studentIdCardFrontPath: latestKyc.student_id_card_front_path,
          studentIdCardBackPath: latestKyc.student_id_card_back_path,
          cnicFrontImagePath: latestKyc.cnic_front_image_path,
          cnicBackImagePath: latestKyc.cnic_back_image_path,
          selfieImagePath: latestKyc.selfie_image_path,
          submittedAt: latestKyc.submitted_at,
          reviewedBy: latestKyc.reviewed_by,
          reviewedAt: latestKyc.reviewed_at,
          reviewNotes: latestKyc.review_notes,
          isAnnualRenewal: latestKyc.is_annual_renewal,
          createdAt: latestKyc.created_at,
          reviewer: latestKyc.users
            ? {
              id: latestKyc.users.id,
              email: latestKyc.users.email,
            }
            : null,
        }
        : null,
      emailConfirmed: await this.getEmailConfirmedStatus(student.user_id),
      cnic: student.cnic,
      dateOfBirth: student.date_of_birth,
      isActive: student.users.is_active ?? false,
      profilePicture: student.profile_picture ?? null,
      verificationSelfiePath: student.verification_selfie_path ?? null,
      platform,
      reviewNotes: latestKyc?.review_notes || null,
      instituteId: student.institute_id ?? null,
      instituteName: student.institutes?.name ?? null,
      studentIdNumber: student.student_id_number ?? null,
    };
  }

  /**
   * Helper method to get email confirmation status from Supabase
   */
  private async getEmailConfirmedStatus(userId: string): Promise<boolean> {
    try {
      const adminSupabase = this.authService.getAdminSupabaseClient();
      const { data, error } = await adminSupabase.auth.admin.getUserById(userId);

      if (error) {
        console.error('Supabase getUserById error:', error);
        return false;
      }

      if (!data.user) {
        return false;
      }

      // Check if email_confirmed_at exists and is not null/undefined
      return !!data.user.email_confirmed_at;
    } catch (error) {
      console.error('Error fetching email confirmation status:', error);
      return false;
    }
  }

  /**
   * Get leaderboard of students ranked by lifetime redemptions
   * Returns students ordered by lifetime_redemptions descending
   */
  async getLeaderboard(
    page: number = 1,
    limit: number = 10,
    period: 'alltime' | 'monthly' = 'alltime',
  ): Promise<{
    items: Array<{
      rank: number;
      name: string;
      university: string;
      redemptions: number;
    }>;
    pagination: PaginationMeta;
  }> {
    const skip = calculateSkip(page, limit);

    if (period === 'monthly') {
      const monthStart = Prisma.sql`DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi'`;

      const [countResult, monthlyRows] = await Promise.all([
        this.prisma.$queryRaw<[{ count: bigint }]>`
          WITH monthly_counts AS (
            SELECT r.student_id
            FROM redemptions r
            JOIN students s ON s.id = r.student_id
            WHERE r.verified_by IS NOT NULL
              AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED%')
              AND s.verification_status = 'approved'
              AND r.created_at >= ${monthStart}
            GROUP BY r.student_id
            HAVING COUNT(*) > 0
          )
          SELECT COUNT(*)::bigint AS count FROM monthly_counts
        `,
        this.prisma.$queryRaw<
          Array<{
            student_id: string;
            monthly_count: bigint;
            first_name: string;
            last_name: string;
            parchi_id: string | null;
            university: string;
            profile_picture: string | null;
          }>
        >`
          WITH monthly_counts AS (
            SELECT
              r.student_id,
              COUNT(*)::bigint AS monthly_count
            FROM redemptions r
            JOIN students s ON s.id = r.student_id
            WHERE r.verified_by IS NOT NULL
              AND (r.notes IS NULL OR r.notes NOT ILIKE 'REJECTED%')
              AND s.verification_status = 'approved'
              AND r.created_at >= ${monthStart}
            GROUP BY r.student_id
            HAVING COUNT(*) > 0
          )
          SELECT
            mc.student_id,
            mc.monthly_count,
            s.first_name,
            s.last_name,
            s.parchi_id,
            s.university,
            s.profile_picture
          FROM monthly_counts mc
          JOIN students s ON s.id = mc.student_id
          ORDER BY mc.monthly_count DESC, s.id ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
      ]);

      const total = Number(countResult[0]?.count ?? 0);

      const items = monthlyRows.map((row, index) => ({
        rank: skip + index + 1,
        name: `${row.first_name} ${row.last_name}`,
        userId: row.student_id,
        parchiId: row.parchi_id,
        university: row.university,
        redemptions: Number(row.monthly_count),
        profilePicture: row.profile_picture ?? null,
      }));

      return {
        items,
        pagination: calculatePaginationMeta(total, page, limit),
      };
    }

    const leaderboardWhere = { verification_status: 'approved' } as const;

    const [total, students] = await Promise.all([
      this.prisma.students.count({ where: leaderboardWhere }),
      this.prisma.students.findMany({
        where: leaderboardWhere,
        select: {
          id: true,
          parchi_id: true,
          first_name: true,
          last_name: true,
          university: true,
          lifetime_redemptions: true,
          profile_picture: true,
        },
        orderBy: [
          { lifetime_redemptions: 'desc' },
          { last_redemption_at: 'desc' },
          { id: 'asc' },
        ],
        skip,
        take: limit,
      }),
    ]);

    const items = students.map((student, index) => ({
      rank: skip + index + 1,
      name: `${student.first_name} ${student.last_name}`,
      userId: student.id,
      parchiId: student.parchi_id,
      university: student.university,
      redemptions: student.lifetime_redemptions || 0,
      profilePicture: student.profile_picture ?? null,
    }));

    return {
      items,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }

  async submitSelfieChangeRequest(
    userId: string,
    file: { buffer: Buffer; mimetype?: string },
  ) {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      include: { users: true },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    const existingPending = await this.prisma.selfie_change_requests.findFirst({
      where: { student_id: student.id, status: 'pending' },
    });

    if (existingPending) {
      throw new BadRequestException('You already have a pending selfie change request');
    }

    const signupKey = student.users.email
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');

    const selfieImageUrl = await this.authService.uploadStudentKycFile(
      file,
      'selfie-change-requests',
      signupKey,
    );

    const request = await this.prisma.selfie_change_requests.create({
      data: {
        student_id: student.id,
        new_selfie_path: selfieImageUrl,
        status: 'pending',
      },
    });

    return {
      id: request.id,
      status: request.status,
      createdAt: request.created_at,
    };
  }

  async getSelfieChangeRequestStatus(userId: string) {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    const pending = await this.prisma.selfie_change_requests.findFirst({
      where: { student_id: student.id, status: 'pending' },
      orderBy: { created_at: 'desc' },
    });

    return {
      hasPendingRequest: !!pending,
      request: pending
        ? {
            id: pending.id,
            status: pending.status,
            createdAt: pending.created_at,
          }
        : null,
    };
  }

  async getSelfieChangeRequests(status: string = 'pending') {
    const requests = await this.prisma.selfie_change_requests.findMany({
      where: { status },
      orderBy: { created_at: 'asc' },
      include: {
        students: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            parchi_id: true,
            university: true,
            verification_selfie_path: true,
            student_kyc: {
              select: {
                student_id_card_front_path: true,
              },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    return requests.map((req) => ({
      id: req.id,
      status: req.status,
      newSelfiePath: req.new_selfie_path,
      adminNote: req.admin_note,
      createdAt: req.created_at,
      resolvedAt: req.resolved_at,
      student: {
        id: req.students.id,
        firstName: req.students.first_name,
        lastName: req.students.last_name,
        parchiId: req.students.parchi_id,
        university: req.students.university,
        verificationSelfie: req.students.verification_selfie_path,
        idCardFrontPath:
          req.students.student_kyc[0]?.student_id_card_front_path ?? null,
      },
    }));
  }

  async resolveSelfieChangeRequest(
    requestId: string,
    action: 'approve' | 'reject',
    adminNote?: string,
  ) {
    const request = await this.prisma.selfie_change_requests.findUnique({
      where: { id: requestId },
      include: { students: true },
    });

    if (!request) {
      throw new NotFoundException('Selfie change request not found');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been resolved');
    }

    const now = new Date();
    const status = action === 'approve' ? 'approved' : 'rejected';

    await this.prisma.$transaction(async (tx) => {
      await tx.selfie_change_requests.update({
        where: { id: requestId },
        data: {
          status,
          admin_note: adminNote || null,
          resolved_at: now,
        },
      });

      if (action === 'approve') {
        await tx.students.update({
          where: { id: request.student_id },
          data: { verification_selfie_path: request.new_selfie_path },
        });
      }
    });

    return { id: requestId, status, resolvedAt: now };
  }

  /**
   * Mark the app intro as seen for a student
   */
  async markAppIntroSeen(userId: string): Promise<void> {
    await this.prisma.students.update({
      where: { user_id: userId },
      data: { has_seen_app_intro: true },
    });
  }

  /**
   * Infer platform from FCM tokens or analytics events
   */
  private async getInferredPlatform(userId: string): Promise<string | null> {
    const fcmToken = await this.prisma.user_fcm_tokens.findFirst({
      where: { 
        user_id: userId, 
        platform: { not: null, notIn: ['unknown', 'undefined', ''] } 
      },
      orderBy: { updated_at: 'desc' },
      select: { platform: true }
    });
    if (fcmToken?.platform) return fcmToken.platform;

    const analyticEvent = await this.prisma.analytics_events.findFirst({
      where: { 
        user_id: userId, 
        platform: { not: null, notIn: ['unknown', 'undefined', ''] } 
      },
      orderBy: { created_at: 'desc' },
      select: { platform: true }
    });
    return analyticEvent?.platform || null;
  }

}

