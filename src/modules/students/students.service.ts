import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '@prisma/client';
import { CurrentUser } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { ROLES, VerificationStatus } from '../../constants/app.constants';
import { ApproveRejectStudentDto } from './dto/approve-reject-student.dto';
import {
  calculatePaginationMeta,
  calculateSkip,
} from '../../utils/pagination.util';
import { PaginationMeta } from '../../utils/pagination.util';
import { SohoStrategy } from '../redemptions/strategies/soho.strategy';

export interface StudentVerificationResponse {
  parchiId: string;
  firstName: string;
  lastName: string;
  university: string;
  verificationStatus: string;
  verificationSelfie: string | null;
  offer: {
    id: string;
    title: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    maxDiscountAmount: number | null;
    isBonus: boolean;
  } | null;
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

    const [students, total] = await Promise.all([
      this.prisma.students.findMany({
        where: {
          verification_status: 'pending',
        },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              phone: true,
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
  ): Promise<{ items: StudentKycResponse[]; pagination: PaginationMeta }> {
    const skip = calculateSkip(page, limit);

    const whereClause: Prisma.studentsWhereInput = {};
    const conditions: Prisma.studentsWhereInput[] = [];

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
    if (currentUser.role !== ROLES.MERCHANT_BRANCH || !currentUser.branch?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    const branchId = currentUser.branch.id;
    const merchantId = currentUser.branch.merchant_id;
    if (!merchantId) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    // Normalize parchi ID (uppercase, trim)
    const normalizedParchiId = parchiId.trim().toUpperCase();
    // Get student first (required for subsequent queries)
    const student = await this.prisma.students.findUnique({
      where: { parchi_id: normalizedParchiId },
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
    const [studentStats, bonusSettings, defaultOffer] = await Promise.all([
      // 1. Get student stats for this branch to check bonus eligibility
      this.prisma.student_branch_stats.findUnique({
        where: {
          student_id_branch_id: {
            student_id: student.id,
            branch_id: branchId,
          },
        },
        select: {
          redemption_count: true,
        },
      }),
      // 2. Get bonus settings
      this.prisma.branch_bonus_settings.findUnique({
        where: { branch_id: branchId },
        select: {
          is_active: true,
          redemptions_required: true,
          discount_type: true,
          discount_value: true,
          max_discount_amount: true,
          additional_item: true, // <--- ADDED THIS
        },
      }),
      // 3. Get active default offer for the branch
      this.prisma.offers.findFirst({
        where: {
          merchant_id: merchantId,
          status: 'active',
          valid_from: { lte: now },
          valid_until: { gte: now },
          offer_branches: {
            some: {
              branch_id: branchId,
            },
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          discount_type: true,
          discount_value: true,
          max_discount_amount: true,
          redemption_strategy: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      }),
    ]);
    // Check for custom strategy
    let strategyDiscount: number | null = null;
    let strategyNote: string | null = null;

    if (defaultOffer?.redemption_strategy === 'soho_hierarchical') {
      const result = await this.sohoStrategy.calculateDiscount({
        studentId: student.id,
        merchantId: merchantId,
        offerId: defaultOffer.id,
        tx: this.prisma,
      });
      strategyDiscount = result.discountValue;
      strategyNote = result.note ?? null;
    }

    // Determine applicable offer
    const applicableOffer = this.determineApplicableOffer(
      studentStats,
      bonusSettings,
      defaultOffer,
      strategyDiscount,
      strategyNote,
    );
    return {
      parchiId: student.parchi_id,
      firstName: student.first_name,
      lastName: student.last_name,
      university: student.university,
      verificationStatus: student.verification_status || 'pending',
      verificationSelfie: student.verification_selfie_path,
      offer: applicableOffer,
    };
  }
  /**
   * Determine the applicable offer based on student stats, bonus settings, and default offer
   * Returns bonus offer if eligible, otherwise default offer
   */
  private determineApplicableOffer(
    studentStats: { redemption_count: number | null } | null,
    bonusSettings: {
      is_active: boolean | null;
      redemptions_required: number;
      discount_type: string;
      discount_value: any; // Prisma Decimal type
      max_discount_amount: any | null; // Prisma Decimal type
      additional_item: string | null; // <--- ADDED THIS
    } | null,
    defaultOffer: {
      id: string;
      title: string;
      description: string | null;
      discount_type: string;
      discount_value: any; // Prisma Decimal type
      max_discount_amount: any | null; // Prisma Decimal type
    } | null,
    strategyDiscount?: number | null,
    strategyNote?: string | null,
  ): {
    id: string;
    title: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    maxDiscountAmount: number | null;
    additionalItem?: string | null; // <--- ADDED THIS
    isBonus: boolean;
  } | null {
    if (!defaultOffer) {
      return null;
    }

    // Strategy Override (Highest Priority)
    if (strategyDiscount !== null && strategyDiscount !== undefined) {
      return {
        id: defaultOffer.id,
        title: defaultOffer.title,
        description: strategyNote || defaultOffer.description,
        discountType: defaultOffer.discount_type,
        discountValue: strategyDiscount,
        maxDiscountAmount: defaultOffer.max_discount_amount
          ? Number(defaultOffer.max_discount_amount)
          : null,
        isBonus: true,
      };
    }
    const currentRedemptions = studentStats?.redemption_count ?? 0;
    const isBonusEligible =
      bonusSettings?.is_active === true &&
      (currentRedemptions + 1) % bonusSettings.redemptions_required === 0;
    if (isBonusEligible && bonusSettings) {
      // Construct bonus offer using bonus settings and default offer's validity
      return {
        id: defaultOffer.id, // Use real offer ID so it can be looked up during redemption
        title: this.LOYALTY_BONUS_TITLE,
        description: this.LOYALTY_BONUS_DESCRIPTION,
        discountType: bonusSettings.discount_type,
        discountValue: Number(bonusSettings.discount_value),
        maxDiscountAmount: bonusSettings.max_discount_amount
          ? Number(bonusSettings.max_discount_amount)
          : null,
        additionalItem: bonusSettings.additional_item, // <--- ADDED THIS
        isBonus: true,
      };
    }
    // Use default offer
    return {
      id: defaultOffer.id,
      title: defaultOffer.title,
      description: defaultOffer.description,
      discountType: defaultOffer.discount_type,
      discountValue: Number(defaultOffer.discount_value),
      maxDiscountAmount: defaultOffer.max_discount_amount
        ? Number(defaultOffer.max_discount_amount)
        : null,
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
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    return this.formatStudentDetailResponse(student);
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

    // Use transaction to ensure all updates happen atomically
    await this.prisma.$transaction(async (tx) => {
      // Get KYC selfie path if available and approving
      const latestKyc = student.student_kyc.length > 0 ? student.student_kyc[0] : null;
      const selfiePath =
        approveRejectDto.action === 'approve' && latestKyc
          ? latestKyc.selfie_image_path
          : undefined;

      // 1. Update student verification status and save selfie if approving
      await tx.students.update({
        where: { id },
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

    if (result) {
      if (approveRejectDto.action === 'approve') {
        this.mailService.sendStudentApprovedEmail(
          result.users.email,
          result.first_name,
        );
      } else {
        this.mailService.sendStudentRejectedEmail(
          result.users.email,
          result.first_name,
          approveRejectDto.reviewNotes || 'Does not meet requirements',
        );
      }
    }

    return this.formatStudentResponse(result!);
  }

  /**
   * Format student list response (without KYC data)
   */
  private async formatStudentListResponse(student: any): Promise<StudentListResponse> {
    return {
      id: student.id,
      userId: student.user_id,
      parchiId: student.parchi_id,
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
      parchiId: student.parchi_id,
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
      parchiId: student.parchi_id,
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
   * Get leaderboard of students ranked by total redemptions
   * Returns students ordered by total_redemptions descending
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

    // Get total count of verified students
    const total = await this.prisma.students.count({
      where: {
        verification_status: 'approved',
      },
    });

    // Get students ordered by total_redemptions descending
    const students = await this.prisma.students.findMany({
      where: {
        verification_status: 'approved',
      },
      select: {
        first_name: true,
        last_name: true,
        university: true,
        total_redemptions: true,
      },
      orderBy: {
        total_redemptions: 'desc',
      },
      skip,
      take: limit,
    });

    // Calculate rank based on skip + index + 1
    const items = students.map((student, index) => ({
      rank: skip + index + 1,
      name: `${student.first_name} ${student.last_name}`,
      university: student.university,
      redemptions: student.total_redemptions || 0,
    }));

    return {
      items,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }
}

