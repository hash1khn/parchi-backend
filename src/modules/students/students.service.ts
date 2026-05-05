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

    const formattedStudents = await Promise.all(
      students.map((student) => this.formatStudentListResponse(student)),
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
  ): Promise<{ items: any[]; pagination: PaginationMeta }> {
    if (groupBy) {
      return this.getStudentSegmentation(groupBy);
    }

    const skip = calculateSkip(page, limit);
    const whereClause: Prisma.studentsWhereInput = {};
    const conditions: Prisma.studentsWhereInput[] = [];
    if (emailVerified !== undefined) {
      const isVerified = emailVerified === 'true';
      if (isVerified) {
        conditions.push({
          users: {
            is: {
              users: {
                is: {
                  email_confirmed_at: { not: null },
                },
              },
            },
          },
        });
      } else {
        // Redefined: "Unverified" filter now means (Email Unverified OR KYC Pending)
        conditions.push({
          OR: [
            {
              users: {
                is: {
                  users: {
                    is: {
                      email_confirmed_at: null,
                    },
                  },
                },
              },
            },
            {
              verification_status: 'pending',
            },
          ],
        });
      }
    } else {
      // Default behavior: for normal "All Students" view, we previously only showed verified.
      // But the user specifically asked for an "unverified" filter, implying they want to see them.
      // I will remove the hardcoded filter so all are shown if no specific filter is requested.
    }

    if (status) {
      conditions.push({ verification_status: status });
    }

    if (institute) {
      conditions.push({
        university: {
          contains: institute,
          mode: 'insensitive',
        },
      });
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
                  id: true,
                  email: true,
                },
              },
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

    const formattedStudents = await Promise.all(
      students.map((student) => this.formatStudentResponse(student)),
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

    return this.formatStudentDetailResponse(student);
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
    }
    if (dto.verificationStatus !== undefined) {
      studentUpdates.verification_status = dto.verificationStatus;
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

      // 3. Handle KYC record
      if (latestKyc) {
        if (approveRejectDto.action === 'approve') {
          // Delete KYC data immediately after approving (selfie already saved)
          await tx.student_kyc.delete({
            where: { id: latestKyc.id },
          });
        } else {
          // For rejection, update KYC with review info (keep for audit trail)
          await tx.student_kyc.update({
            where: { id: latestKyc.id },
            data: {
              reviewed_by: reviewerId,
              reviewed_at: now,
              review_notes: approveRejectDto.reviewNotes || null,
            },
          });
        }
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
  private async formatStudentListResponse(student: any): Promise<StudentListResponse> {
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
      totalRedemptions: student.total_redemptions || 0,
      verificationStatus: student.verification_status,
      verifiedAt: student.verified_at,
      verificationExpiresAt: student.verification_expires_at,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
      emailConfirmed: await this.getEmailConfirmedStatus(student.user_id),
      cnic: student.cnic,
      dateOfBirth: student.date_of_birth,
      isActive: student.users.is_active ?? false,
      platform: student.platform,
      reviewNotes: student.student_kyc?.[0]?.review_notes || null,
      instituteId: student.institute_id ?? null,
      instituteName: student.institutes?.name ?? null,
      studentIdNumber: student.student_id_number ?? null,
    };
  }

  /**
   * Format student response with KYC data
   */
  private async formatStudentResponse(student: any): Promise<StudentKycResponse> {
    const latestKyc = student.student_kyc?.[0] || null;

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
      totalRedemptions: student.total_redemptions || 0,
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
      platform: student.platform,
      reviewNotes: latestKyc?.review_notes || null,
      instituteId: student.institute_id ?? null,
      instituteName: student.institutes?.name ?? null,
      studentIdNumber: student.student_id_number ?? null,
    };
  }

  /**
   * Format student detail response
   */
  private async formatStudentDetailResponse(student: any): Promise<StudentDetailResponse> {
    const latestKyc = student.student_kyc?.[0] || null;

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
      totalRedemptions: student.total_redemptions || 0,
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
      platform: student.platform,
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

    const leaderboardWhere = { verification_status: 'approved' } as const;

    // Run count and data fetch in parallel — uses idx_students_leaderboard index
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
          // Stable tie-breaker so rank ordering is deterministic.
          { id: 'asc' },
        ],
        skip,
        take: limit,
      }),
    ]);

    // Calculate rank based on skip + index + 1
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

  /**
   * Mark the app intro as seen for a student
   */
  async markAppIntroSeen(userId: string): Promise<void> {
    await this.prisma.students.update({
      where: { user_id: userId },
      data: { has_seen_app_intro: true },
    });
  }
}

