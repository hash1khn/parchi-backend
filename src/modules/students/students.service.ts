import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiResponse, PaginatedResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { ApproveRejectStudentDto } from './dto/approve-reject-student.dto';
import {
  calculatePaginationMeta,
  calculateSkip,
} from '../../utils/pagination.util';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';

export interface StudentListResponse {
  id: string;
  userId: string;
  parchiId: string;
  firstName: string;
  lastName: string;
  email: string;
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
}

export interface StudentKycResponse {
  id: string;
  userId: string;
  parchiId: string;
  firstName: string;
  lastName: string;
  email: string;
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
  kyc?: {
    id: string;
    studentIdImagePath: string;
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
    studentIdImagePath: string;
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get pending approval students
   * Admin only
   * Returns list without KYC data for better performance
   */
  async getPendingApprovalStudents(
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<StudentListResponse>> {
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
          created_at: 'desc',
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

    const formattedStudents = students.map((student) =>
      this.formatStudentListResponse(student),
    );

    return createPaginatedResponse(
      formattedStudents,
      calculatePaginationMeta(total, page, limit),
      API_RESPONSE_MESSAGES.STUDENT.LIST_SUCCESS,
    );
  }

  /**
   * Get all students
   * Admin only
   */
  async getAllStudents(
    status?: 'pending' | 'approved' | 'rejected' | 'expired',
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<StudentKycResponse>> {
    const skip = calculateSkip(page, limit);

    const whereClause: any = {};
    if (status) {
      whereClause.verification_status = status;
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

    const formattedStudents = students.map((student) =>
      this.formatStudentResponse(student),
    );

    return createPaginatedResponse(
      formattedStudents,
      calculatePaginationMeta(total, page, limit),
      API_RESPONSE_MESSAGES.STUDENT.LIST_SUCCESS,
    );
  }

  /**
   * Get student details by ID for review
   * Admin only
   */
  async getStudentDetailsForReview(
    id: string,
  ): Promise<ApiResponse<StudentDetailResponse>> {
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

    return createApiResponse(
      this.formatStudentDetailResponse(student),
      API_RESPONSE_MESSAGES.STUDENT.GET_SUCCESS,
    );
  }

  /**
   * Approve or reject student
   * Admin only
   */
  async approveRejectStudent(
    id: string,
    approveRejectDto: ApproveRejectStudentDto,
    reviewerId: string,
  ): Promise<ApiResponse<StudentKycResponse>> {
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
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update student verification status
      const updatedStudent = await tx.students.update({
        where: { id },
        data: {
          verification_status: verificationStatus,
          verified_at: now,
          // Set expiration date to 1 year from now if approved
          verification_expires_at:
            approveRejectDto.action === 'approve'
              ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
              : null,
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
      if (student.student_kyc.length > 0) {
        const latestKyc = student.student_kyc[0];

        if (approveRejectDto.action === 'approve') {
          // Delete KYC data immediately after approving
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

      // Return updated student with relations
      return await tx.students.findUnique({
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
    });

    return createApiResponse(
      this.formatStudentResponse(result!),
      approveRejectDto.action === 'approve'
        ? API_RESPONSE_MESSAGES.STUDENT.APPROVE_SUCCESS
        : API_RESPONSE_MESSAGES.STUDENT.REJECT_SUCCESS,
    );
  }

  /**
   * Format student list response (without KYC data)
   */
  private formatStudentListResponse(student: any): StudentListResponse {
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
    };
  }

  /**
   * Format student response with KYC data
   */
  private formatStudentResponse(student: any): StudentKycResponse {
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
      verificationExpiresAt: student.verification_expires_at,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
      kyc: latestKyc
        ? {
            id: latestKyc.id,
            studentIdImagePath: latestKyc.student_id_image_path,
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
    };
  }

  /**
   * Format student detail response
   */
  private formatStudentDetailResponse(student: any): StudentDetailResponse {
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
      verificationExpiresAt: student.verification_expires_at,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
      kyc: latestKyc
        ? {
            id: latestKyc.id,
            studentIdImagePath: latestKyc.student_id_image_path,
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
    };
  }
}

