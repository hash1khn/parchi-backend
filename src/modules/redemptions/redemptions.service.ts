import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ApiResponse, PaginatedResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { CreateRedemptionDto } from './dto/create-redemption.dto';
import { UpdateRedemptionDto } from './dto/update-redemption.dto';
import { QueryRedemptionsDto } from './dto/query-redemptions.dto';
import { ROLES } from '../../constants/app.constants';
import { CurrentUser } from '../../types/global.types';
import {
  calculatePaginationMeta,
  calculateSkip,
} from '../../utils/pagination.util';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';

export interface RedemptionResponse {
  id: string;
  studentId: string;
  offerId: string;
  branchId: string;
  isBonusApplied: boolean;
  bonusDiscountApplied: number | null;
  verifiedBy: string | null;
  notes: string | null;
  createdAt: Date | null;
  status: 'pending' | 'verified' | 'rejected';
  offer?: {
    id: string;
    title: string;
    discountType: string;
    discountValue: number;
    imageUrl: string | null;
  };
  branch?: {
    id: string;
    branchName: string;
    address: string;
    city: string;
  };
  merchant?: {
    id: string;
    businessName: string;
    logoPath: string | null;
    category: string | null;
  };
  student?: {
    id: string;
    parchiId: string;
    firstName: string;
    lastName: string;
  };
}

export interface RedemptionStatsResponse {
  totalRedemptions: number;
  totalSavings: number;
  verifiedRedemptions: number;
  pendingRedemptions: number;
  rejectedRedemptions: number;
  topMerchants: Array<{
    merchantId: string;
    merchantName: string;
    redemptionCount: number;
    totalSavings: number;
  }>;
  topBranches: Array<{
    branchId: string;
    branchName: string;
    redemptionCount: number;
    totalSavings: number;
  }>;
  recentRedemptions: RedemptionResponse[];
}

@Injectable()
export class RedemptionsService {
  // Time window to prevent duplicate redemptions (5 seconds)
  private readonly DUPLICATE_PREVENTION_WINDOW_MS = 5000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create redemption
   * Branch staff only
   */
  async createRedemption(
    createDto: CreateRedemptionDto,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<RedemptionResponse>> {
    // Verify branch staff has a branch
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    const branchId = currentUser.branch.id;

    // Normalize parchi ID (uppercase, trim)
    const normalizedParchiId = createDto.parchiId.trim().toUpperCase();

    if (!normalizedParchiId || !normalizedParchiId.startsWith('PK-')) {
      throw new BadRequestException(
        API_RESPONSE_MESSAGES.REDEMPTION.INVALID_PARCHI_ID,
      );
    }

    // Use transaction to ensure atomicity and prevent race conditions
    const redemption = await this.prisma.$transaction(
      async (tx) => {
        // 1. Find student by parchi ID
        const student = await tx.students.findUnique({
          where: { parchi_id: normalizedParchiId },
          include: {
            users: {
              select: {
                id: true,
                is_active: true,
              },
            },
          },
        });

        if (!student) {
          throw new NotFoundException(
            API_RESPONSE_MESSAGES.REDEMPTION.STUDENT_NOT_FOUND,
          );
        }

        if (!student.users.is_active) {
          throw new ForbiddenException(
            API_RESPONSE_MESSAGES.REDEMPTION.STUDENT_NOT_VERIFIED,
          );
        }

        if (student.verification_status !== 'approved') {
          throw new ForbiddenException(
            API_RESPONSE_MESSAGES.REDEMPTION.STUDENT_NOT_VERIFIED,
          );
        }

        // 2. Verify branch exists and is active
        const branch = await tx.merchant_branches.findUnique({
          where: { id: branchId },
          include: {
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
          },
        });

        if (!branch) {
          throw new NotFoundException(
            API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_NOT_FOUND,
          );
        }

        if (!branch.is_active) {
          throw new BadRequestException(
            API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_NOT_ACTIVE,
          );
        }

        // 3. Verify offer exists and is active
        const offer = await tx.offers.findUnique({
          where: { id: createDto.offerId },
          include: {
            offer_branches: {
              where: {
                branch_id: branchId,
                is_active: true,
              },
            },
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
          },
        });

        if (!offer) {
          throw new NotFoundException(
            API_RESPONSE_MESSAGES.REDEMPTION.OFFER_NOT_FOUND,
          );
        }

        // 4. Verify offer is active and within validity period
        const now = new Date();
        if (offer.status !== 'active') {
          throw new BadRequestException(
            API_RESPONSE_MESSAGES.REDEMPTION.OFFER_NOT_ACTIVE,
          );
        }

        if (offer.valid_from > now || offer.valid_until < now) {
          throw new BadRequestException(
            API_RESPONSE_MESSAGES.REDEMPTION.OFFER_NOT_ACTIVE,
          );
        }

        // 5. Verify offer is available at this branch
        if (!offer.offer_branches || offer.offer_branches.length === 0) {
          throw new BadRequestException(
            API_RESPONSE_MESSAGES.REDEMPTION.OFFER_NOT_AVAILABLE_AT_BRANCH,
          );
        }

        // 5.5. Validate schedule (allowed_days and time windows)
        const scheduleType = offer.schedule_type || 'always';
        if (scheduleType === 'custom') {
          // Check if today is in allowed_days
          const allowedDays = offer.allowed_days || [];
          if (allowedDays.length > 0) {
            const today = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (!allowedDays.includes(today)) {
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              throw new BadRequestException(
                `This offer is not available on ${dayNames[today]}. It is only available on: ${allowedDays.map(d => dayNames[d]).join(', ')}`,
              );
            }
          }

          // Check if current time is within the time window
          const startTime = offer.start_time;
          const endTime = offer.end_time;
          
          if (startTime && endTime) {
            const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
            
            // Convert database time to minutes
            const formatTimeToMinutes = (time: Date): number => {
              const date = new Date(time);
              return date.getUTCHours() * 60 + date.getUTCMinutes();
            };
            
            const startMinutes = formatTimeToMinutes(startTime);
            const endMinutes = formatTimeToMinutes(endTime);
            
            // Handle time windows that span midnight (e.g., 22:00 - 02:00)
            let isWithinWindow = false;
            if (startMinutes <= endMinutes) {
              // Normal time window (e.g., 09:00 - 17:00)
              isWithinWindow = currentTime >= startMinutes && currentTime <= endMinutes;
            } else {
              // Time window spans midnight (e.g., 22:00 - 02:00)
              isWithinWindow = currentTime >= startMinutes || currentTime <= endMinutes;
            }
            
            if (!isWithinWindow) {
              const formatTimeString = (time: Date): string => {
                const date = new Date(time);
                const hours = date.getUTCHours().toString().padStart(2, '0');
                const minutes = date.getUTCMinutes().toString().padStart(2, '0');
                return `${hours}:${minutes}`;
              };
              
              throw new BadRequestException(
                `This offer is only available between ${formatTimeString(startTime)} and ${formatTimeString(endTime)}. Current time is outside this window.`,
              );
            }
          }
        }

        // 6. Check offer limits
        if (
          offer.total_limit &&
          (offer.current_redemptions || 0) >= offer.total_limit
        ) {
          throw new BadRequestException(
            API_RESPONSE_MESSAGES.REDEMPTION.OFFER_LIMIT_REACHED,
          );
        }

        // 7. Calculate start of day for daily limit checks
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        // 8. Check daily limit for this offer
        if (offer.daily_limit) {
          const todayRedemptions = await tx.redemptions.count({
            where: {
              offer_id: createDto.offerId,
              branch_id: branchId,
              created_at: {
                gte: startOfDay,
              },
            },
          });

          if (todayRedemptions >= offer.daily_limit) {
            throw new BadRequestException(
              API_RESPONSE_MESSAGES.REDEMPTION.OFFER_LIMIT_REACHED,
            );
          }
        }

        // 9. RACE CONDITION PREVENTION: Check for recent duplicate redemption
        const recentWindow = new Date(
          now.getTime() - this.DUPLICATE_PREVENTION_WINDOW_MS,
        );

        const recentRedemption = await tx.redemptions.findFirst({
          where: {
            student_id: student.id,
            offer_id: createDto.offerId,
            branch_id: branchId,
            created_at: {
              gte: recentWindow,
            },
          },
          orderBy: {
            created_at: 'desc',
          },
        });

        if (recentRedemption) {
          throw new BadRequestException(
            API_RESPONSE_MESSAGES.REDEMPTION.DUPLICATE_REDEMPTION,
          );
        }

        // 10. Check student's daily limit for this offer at this branch
        // REMOVED: Hardcoded limit of 1 redemption per student per day per branch removed as per requirement.
        // const studentTodayRedemptions = await tx.redemptions.count({ ... });
        // if (studentTodayRedemptions > 0) { ... }

        // 11. Calculate bonus discount
        let isBonusApplied = false;
        let bonusDiscountApplied: number | null = null;

        const bonusSettings = await tx.branch_bonus_settings.findUnique({
          where: { branch_id: branchId },
        });

        if (bonusSettings && bonusSettings.is_active) {
          const studentBranchStats = await tx.student_branch_stats.findUnique({
            where: {
              student_id_branch_id: {
                student_id: student.id,
                branch_id: branchId,
              },
            },
          });

          const redemptionCount =
            studentBranchStats?.redemption_count || 0;

          // Check if this redemption qualifies for bonus (e.g. 5th redemption)
          // Logic: (current_count + 1) % required === 0
          if ((redemptionCount + 1) % bonusSettings.redemptions_required === 0) {
            isBonusApplied = true;

            if (bonusSettings.discount_type === 'percentage') {
              bonusDiscountApplied = Number(bonusSettings.discount_value);
              if (bonusSettings.max_discount_amount) {
                bonusDiscountApplied = Math.min(
                  bonusDiscountApplied,
                  Number(bonusSettings.max_discount_amount),
                );
              }
            } else {
              // Fixed amount
              bonusDiscountApplied = Number(bonusSettings.discount_value);
            }
          }
        }

        // 12. Calculate savings (offer discount + bonus)
        const offerDiscount = Number(offer.discount_value);
        const totalSavings = isBonusApplied
          ? offerDiscount + (bonusDiscountApplied || 0)
          : offerDiscount;

        // 13. Create redemption record
        const newRedemption = await tx.redemptions.create({
          data: {
            student_id: student.id,
            offer_id: createDto.offerId,
            branch_id: branchId,
            is_bonus_applied: isBonusApplied,
            bonus_discount_applied: bonusDiscountApplied
              ? bonusDiscountApplied
              : null,
            verified_by: currentUser.id, // Auto-verified by branch staff
            notes: createDto.notes || null,
          },
        });

        // 14. Update offer current_redemptions
        await tx.offers.update({
          where: { id: createDto.offerId },
          data: {
            current_redemptions: {
              increment: 1,
            },
          },
        });

        // 15. Update student stats
        await tx.students.update({
          where: { id: student.id },
          data: {
            total_redemptions: {
              increment: 1,
            },
            total_savings: {
              increment: totalSavings,
            },
          },
        });

        // 16. Update student_merchant_stats
        const existingMerchantStats = await tx.student_merchant_stats.findFirst({
          where: {
            student_id: student.id,
            merchant_id: branch.merchant_id,
          },
        });

        if (existingMerchantStats) {
          await tx.student_merchant_stats.update({
            where: { id: existingMerchantStats.id },
            data: {
              redemption_count: {
                increment: 1,
              },
              total_savings: {
                increment: totalSavings,
              },
              last_redemption_at: now,
            },
          });
        } else {
          await tx.student_merchant_stats.create({
            data: {
              student_id: student.id,
              merchant_id: branch.merchant_id,
              redemption_count: 1,
              total_savings: totalSavings,
              last_redemption_at: now,
            },
          });
        }

        // 17. Update student_branch_stats
        const existingBranchStats = await tx.student_branch_stats.findFirst({
          where: {
            student_id: student.id,
            branch_id: branchId,
          },
        });

        if (existingBranchStats) {
          await tx.student_branch_stats.update({
            where: { id: existingBranchStats.id },
            data: {
              redemption_count: {
                increment: 1,
              },
              total_savings: {
                increment: totalSavings,
              },
              last_redemption_at: now,
            },
          });
        } else {
          await tx.student_branch_stats.create({
            data: {
              student_id: student.id,
              branch_id: branchId,
              redemption_count: 1,
              total_savings: totalSavings,
              last_redemption_at: now,
            },
          });
        }

        // Return redemption with relations
        return await tx.redemptions.findUnique({
          where: { id: newRedemption.id },
          include: {
            offers: {
              select: {
                id: true,
                title: true,
                discount_type: true,
                discount_value: true,
                image_url: true,
              },
            },
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                address: true,
                city: true,
              },
            },
            students: {
              select: {
                id: true,
                parchi_id: true,
                first_name: true,
                last_name: true,
              },
            },
            users: {
              select: {
                id: true,
              },
            },
          },
        });
      },
      {
        timeout: 20000, // 20 second timeout for transaction
      },
    );

    return createApiResponse(
      this.formatRedemptionResponse(redemption),
      API_RESPONSE_MESSAGES.REDEMPTION.CREATE_SUCCESS,
    );
  }

  /**
   * Get student's redemptions (history)
   * Student only
   */
  async getStudentRedemptions(
    currentUser: CurrentUser,
    queryDto: QueryRedemptionsDto,
  ): Promise<PaginatedResponse<RedemptionResponse>> {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    // Get student ID
    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
    });

    if (!student) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND,
      );
    }

    const page = queryDto.page || 1;
    const limit = queryDto.limit || 10;
    const skip = calculateSkip(page, limit);

    const whereClause: Prisma.redemptionsWhereInput = {
      student_id: student.id,
    };

    // Status filter (determined by verified_by presence)
    if (queryDto.status) {
      if (queryDto.status === 'verified') {
        whereClause.verified_by = { not: null };
      } else if (queryDto.status === 'rejected') {
        // For now, we'll use notes containing "REJECTED" or a status field
        // Since schema doesn't have status, we'll check verified_by is null and has rejection note
        whereClause.verified_by = null;
        whereClause.notes = { 
          contains: 'REJECTED', 
          mode: 'insensitive' 
        } as Prisma.StringNullableFilter;
      } else if (queryDto.status === 'pending') {
        whereClause.verified_by = null;
        // For pending, notes should not contain REJECTED (case-insensitive)
        // Use OR to handle null notes or notes without REJECTED
        whereClause.OR = [
          { notes: null },
          { notes: { not: { contains: 'REJECTED' } } }
        ];
      }
    }

    // Date range filter
    if (queryDto.startDate || queryDto.endDate) {
      whereClause.created_at = {};
      if (queryDto.startDate) {
        whereClause.created_at.gte = new Date(queryDto.startDate);
      }
      if (queryDto.endDate) {
        whereClause.created_at.lte = new Date(queryDto.endDate);
      }
    }

    // Additional filters
    if (queryDto.merchantId) {
      whereClause.merchant_branches = {
        merchant_id: queryDto.merchantId,
      };
    }
    if (queryDto.branchId) {
      whereClause.branch_id = queryDto.branchId;
    }
    if (queryDto.offerId) {
      whereClause.offer_id = queryDto.offerId;
    }

    const [redemptions, total] = await Promise.all([
      this.prisma.redemptions.findMany({
        where: whereClause,
        include: {
          offers: {
            select: {
              id: true,
              title: true,
              discount_type: true,
              discount_value: true,
              image_url: true,
            },
          },
          merchant_branches: {
            include: {
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
            },
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: true,
            },
          },
        },
        orderBy: this.getOrderBy(queryDto.sort || 'newest'),
        skip,
        take: limit,
      }),
      this.prisma.redemptions.count({ where: whereClause }),
    ]);

    const formattedRedemptions = redemptions.map((r) =>
      this.formatRedemptionResponse(r),
    );

    return createPaginatedResponse(
      formattedRedemptions,
      calculatePaginationMeta(total, page, limit),
      API_RESPONSE_MESSAGES.REDEMPTION.LIST_SUCCESS,
    );
  }

  /**
   * Get redemption by ID (student)
   * Student only
   */
  async getRedemptionById(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<RedemptionResponse>> {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
    });

    if (!student) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND,
      );
    }

    const redemption = await this.prisma.redemptions.findUnique({
      where: { id },
      include: {
        offers: {
          select: {
            id: true,
            title: true,
            discount_type: true,
            discount_value: true,
            image_url: true,
          },
        },
        merchant_branches: {
          include: {
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
          },
          select: {
            id: true,
            branch_name: true,
            address: true,
            city: true,
            merchants: true,
          },
        },
        students: {
          select: {
            id: true,
            parchi_id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    if (!redemption) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND,
      );
    }

    if (redemption.student_id !== student.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    return createApiResponse(
      this.formatRedemptionResponse(redemption),
      API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS,
    );
  }

  /**
   * Get branch redemptions (history)
   * Branch staff only
   */
  async getBranchRedemptions(
    currentUser: CurrentUser,
    queryDto: QueryRedemptionsDto,
  ): Promise<PaginatedResponse<RedemptionResponse>> {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    const branchId = currentUser.branch.id;
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 10;
    const skip = calculateSkip(page, limit);

    const whereClause: Prisma.redemptionsWhereInput = {
      branch_id: branchId,
    };

    // Status filter
    if (queryDto.status) {
      if (queryDto.status === 'verified') {
        whereClause.verified_by = { not: null };
      } else if (queryDto.status === 'rejected') {
        whereClause.verified_by = null;
        whereClause.notes = { contains: 'REJECTED', mode: 'insensitive' } as Prisma.StringNullableFilter;
      } else if (queryDto.status === 'pending') {
        whereClause.verified_by = null;
        // For pending, notes should not contain REJECTED (case-insensitive)
        // Use OR to handle null notes or notes without REJECTED
        whereClause.OR = [
          { notes: null },
          { notes: { not: { contains: 'REJECTED' } } }
        ];
      }
    }

    // Date range filter
    if (queryDto.startDate || queryDto.endDate) {
      whereClause.created_at = {};
      if (queryDto.startDate) {
        whereClause.created_at.gte = new Date(queryDto.startDate);
      }
      if (queryDto.endDate) {
        whereClause.created_at.lte = new Date(queryDto.endDate);
      }
    }

    // Additional filters
    if (queryDto.studentId) {
      whereClause.student_id = queryDto.studentId;
    }
    if (queryDto.parchiId) {
      const student = await this.prisma.students.findUnique({
        where: { parchi_id: queryDto.parchiId.toUpperCase() },
      });
      if (student) {
        whereClause.student_id = student.id;
      } else {
        // Return empty result if student not found
        whereClause.student_id = '00000000-0000-0000-0000-000000000000';
      }
    }
    if (queryDto.offerId) {
      whereClause.offer_id = queryDto.offerId;
    }

    const [redemptions, total] = await Promise.all([
      this.prisma.redemptions.findMany({
        where: whereClause,
        include: {
          offers: {
            select: {
              id: true,
              title: true,
              discount_type: true,
              discount_value: true,
              image_url: true,
            },
          },
          merchant_branches: {
            include: {
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
            },
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: true,
            },
          },
          students: {
            select: {
              id: true,
              parchi_id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
        orderBy: this.getOrderBy(queryDto.sort || 'newest'),
        skip,
        take: limit,
      }),
      this.prisma.redemptions.count({ where: whereClause }),
    ]);

    const formattedRedemptions = redemptions.map((r) =>
      this.formatRedemptionResponse(r),
    );

    return createPaginatedResponse(
      formattedRedemptions,
      calculatePaginationMeta(total, page, limit),
      API_RESPONSE_MESSAGES.REDEMPTION.LIST_SUCCESS,
    );
  }

  /**
   * Get redemption by ID (branch)
   * Branch staff only
   */
  async getBranchRedemptionById(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<RedemptionResponse>> {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    const redemption = await this.prisma.redemptions.findUnique({
      where: { id },
      include: {
        offers: {
          select: {
            id: true,
            title: true,
            discount_type: true,
            discount_value: true,
            image_url: true,
          },
        },
        merchant_branches: {
          include: {
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
          },
          select: {
            id: true,
            branch_name: true,
            address: true,
            city: true,
            merchants: true,
          },
        },
        students: {
          select: {
            id: true,
            parchi_id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    if (!redemption) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND,
      );
    }

    if (redemption.branch_id !== currentUser.branch.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    return createApiResponse(
      this.formatRedemptionResponse(redemption),
      API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS,
    );
  }

  /**
   * Reject redemption
   * Branch staff only
   */
  async rejectRedemption(
    id: string,
    updateDto: UpdateRedemptionDto,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<RedemptionResponse>> {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    if (updateDto.action !== 'reject') {
      throw new BadRequestException('Only reject action is allowed');
    }

    // Use transaction to ensure atomicity
    const redemption = await this.prisma.$transaction(async (tx) => {
      const existingRedemption = await tx.redemptions.findUnique({
        where: { id },
        include: {
          offers: true,
          students: true,
        },
      });

      if (!existingRedemption) {
        throw new NotFoundException(
          API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND,
        );
      }

      if (existingRedemption.branch_id !== currentUser.branch!.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
        );
      }

      // Check if already rejected
      if (
        existingRedemption.notes &&
        existingRedemption.notes.toUpperCase().includes('REJECTED')
      ) {
        throw new BadRequestException(
          API_RESPONSE_MESSAGES.REDEMPTION.REDEMPTION_ALREADY_REJECTED,
        );
      }

      // Calculate savings to revert
      const offerDiscount = Number(existingRedemption.offers.discount_value);
      const bonusDiscount = existingRedemption.bonus_discount_applied
        ? Number(existingRedemption.bonus_discount_applied)
        : 0;
      const totalSavings = offerDiscount + bonusDiscount;

      // Update redemption with rejection note
      const updatedRedemption = await tx.redemptions.update({
        where: { id },
        data: {
          notes: `REJECTED: ${updateDto.notes || 'Redemption rejected'}`,
          verified_by: null, // Remove verification
        },
        include: {
          offers: {
            select: {
              id: true,
              title: true,
              discount_type: true,
              discount_value: true,
              image_url: true,
            },
          },
          merchant_branches: {
            include: {
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
            },
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: true,
            },
          },
          students: {
            select: {
              id: true,
              parchi_id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });

      // Revert offer current_redemptions
      await tx.offers.update({
        where: { id: existingRedemption.offer_id },
        data: {
          current_redemptions: {
            decrement: 1,
          },
        },
      });

      // Revert student stats
      await tx.students.update({
        where: { id: existingRedemption.student_id },
        data: {
          total_redemptions: {
            decrement: 1,
          },
          total_savings: {
            decrement: totalSavings,
          },
        },
      });

      // Revert student_merchant_stats
      const merchantBranch = await tx.merchant_branches.findUnique({
        where: { id: existingRedemption.branch_id },
      });

      if (merchantBranch) {
        await tx.student_merchant_stats.updateMany({
          where: {
            student_id: existingRedemption.student_id,
            merchant_id: merchantBranch.merchant_id,
          },
          data: {
            redemption_count: {
              decrement: 1,
            },
            total_savings: {
              decrement: totalSavings,
            },
          },
        });
      }

      // Revert student_branch_stats
      await tx.student_branch_stats.updateMany({
        where: {
          student_id: existingRedemption.student_id,
          branch_id: existingRedemption.branch_id,
        },
        data: {
          redemption_count: {
            decrement: 1,
          },
          total_savings: {
            decrement: totalSavings,
          },
        },
      });

      return updatedRedemption;
    });

    return createApiResponse(
      this.formatRedemptionResponse(redemption),
      API_RESPONSE_MESSAGES.REDEMPTION.REJECT_SUCCESS,
    );
  }

  /**
   * Get all redemptions (Admin)
   * Admin only
   */
  async getAllRedemptions(
    queryDto: QueryRedemptionsDto,
  ): Promise<PaginatedResponse<RedemptionResponse>> {
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 10;
    const skip = calculateSkip(page, limit);

    const whereClause: Prisma.redemptionsWhereInput = {};

    // Status filter
    if (queryDto.status) {
      if (queryDto.status === 'verified') {
        whereClause.verified_by = { not: null };
      } else if (queryDto.status === 'rejected') {
        whereClause.verified_by = null;
        whereClause.notes = { contains: 'REJECTED', mode: 'insensitive' } as Prisma.StringNullableFilter;
      } else if (queryDto.status === 'pending') {
        whereClause.verified_by = null;
        // For pending, notes should not contain REJECTED (case-insensitive)
        // Use OR to handle null notes or notes without REJECTED
        whereClause.OR = [
          { notes: null },
          { notes: { not: { contains: 'REJECTED' } } }
        ];
      }
    }

    // Date range filter
    if (queryDto.startDate || queryDto.endDate) {
      whereClause.created_at = {};
      if (queryDto.startDate) {
        whereClause.created_at.gte = new Date(queryDto.startDate);
      }
      if (queryDto.endDate) {
        whereClause.created_at.lte = new Date(queryDto.endDate);
      }
    }

    // Additional filters
    if (queryDto.studentId) {
      whereClause.student_id = queryDto.studentId;
    }
    if (queryDto.parchiId) {
      const student = await this.prisma.students.findUnique({
        where: { parchi_id: queryDto.parchiId.toUpperCase() },
      });
      if (student) {
        whereClause.student_id = student.id;
      } else {
        // Return empty result if student not found
        whereClause.student_id = '00000000-0000-0000-0000-000000000000';
      }
    }
    if (queryDto.merchantId) {
      whereClause.merchant_branches = {
        merchant_id: queryDto.merchantId,
      };
    }
    if (queryDto.branchId) {
      whereClause.branch_id = queryDto.branchId;
    }
    if (queryDto.offerId) {
      whereClause.offer_id = queryDto.offerId;
    }

    const [redemptions, total] = await Promise.all([
      this.prisma.redemptions.findMany({
        where: whereClause,
        include: {
          offers: {
            select: {
              id: true,
              title: true,
              discount_type: true,
              discount_value: true,
              image_url: true,
            },
          },
          merchant_branches: {
            include: {
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
            },
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: true,
            },
          },
          students: {
            select: {
              id: true,
              parchi_id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
        orderBy: this.getOrderBy(queryDto.sort || 'newest'),
        skip,
        take: limit,
      }),
      this.prisma.redemptions.count({ where: whereClause }),
    ]);

    const formattedRedemptions = redemptions.map((r) =>
      this.formatRedemptionResponse(r),
    );

    return createPaginatedResponse(
      formattedRedemptions,
      calculatePaginationMeta(total, page, limit),
      API_RESPONSE_MESSAGES.REDEMPTION.LIST_SUCCESS,
    );
  }

  /**
   * Get redemption by ID (Admin)
   * Admin only
   */
  async getAdminRedemptionById(
    id: string,
  ): Promise<ApiResponse<RedemptionResponse>> {
    const redemption = await this.prisma.redemptions.findUnique({
      where: { id },
      include: {
        offers: {
          select: {
            id: true,
            title: true,
            discount_type: true,
            discount_value: true,
            image_url: true,
          },
        },
        merchant_branches: {
          include: {
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
          },
          select: {
            id: true,
            branch_name: true,
            address: true,
            city: true,
            merchants: true,
          },
        },
        students: {
          select: {
            id: true,
            parchi_id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    if (!redemption) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND,
      );
    }

    return createApiResponse(
      this.formatRedemptionResponse(redemption),
      API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS,
    );
  }

  /**
   * Get student redemption statistics
   * Student only
   */
  async getStudentRedemptionStats(
    currentUser: CurrentUser,
  ): Promise<ApiResponse<RedemptionStatsResponse>> {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
    });

    if (!student) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND,
      );
    }

    const [
      totalRedemptions,
      verifiedRedemptions,
      rejectedRedemptions,
      topMerchants,
      topBranches,
      recentRedemptions,
    ] = await Promise.all([
      this.prisma.redemptions.count({
        where: { student_id: student.id },
      }),
      this.prisma.redemptions.count({
        where: {
          student_id: student.id,
          verified_by: { not: null },
        },
      }),
      this.prisma.redemptions.count({
        where: {
          student_id: student.id,
          notes: { contains: 'REJECTED', mode: 'insensitive' },
        },
      }),
      this.prisma.student_merchant_stats.findMany({
        where: { student_id: student.id },
        include: {
          merchants: {
            select: {
              id: true,
              business_name: true,
            },
          },
        },
        orderBy: {
          redemption_count: 'desc',
        },
        take: 5,
      }),
      this.prisma.student_branch_stats.findMany({
        where: { student_id: student.id },
        include: {
          merchant_branches: {
            select: {
              id: true,
              branch_name: true,
            },
          },
        },
        orderBy: {
          redemption_count: 'desc',
        },
        take: 5,
      }),
      this.prisma.redemptions.findMany({
        where: { student_id: student.id },
        include: {
          offers: {
            select: {
              id: true,
              title: true,
              discount_type: true,
              discount_value: true,
              image_url: true,
            },
          },
          merchant_branches: {
            include: {
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
            },
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        take: 5,
      }),
    ]);

    return createApiResponse(
      {
        totalRedemptions,
        totalSavings: Number(student.total_savings || 0),
        verifiedRedemptions,
        pendingRedemptions:
          totalRedemptions - verifiedRedemptions - rejectedRedemptions,
        rejectedRedemptions,
        topMerchants: topMerchants.map((stat) => ({
          merchantId: stat.merchant_id,
          merchantName: stat.merchants.business_name,
          redemptionCount: stat.redemption_count || 0,
          totalSavings: Number(stat.total_savings || 0),
        })),
        topBranches: topBranches.map((stat) => ({
          branchId: stat.branch_id,
          branchName: stat.merchant_branches.branch_name,
          redemptionCount: stat.redemption_count || 0,
          totalSavings: Number(stat.total_savings || 0),
        })),
        recentRedemptions: recentRedemptions.map((r) =>
          this.formatRedemptionResponse(r),
        ),
      },
      API_RESPONSE_MESSAGES.REDEMPTION.STATS_SUCCESS,
    );
  }

  /**
   * Format redemption response
   */
  private formatRedemptionResponse(redemption: any): RedemptionResponse {
    const status = redemption.notes &&
      redemption.notes.toUpperCase().includes('REJECTED')
      ? 'rejected'
      : redemption.verified_by
        ? 'verified'
        : 'pending';

    return {
      id: redemption.id,
      studentId: redemption.student_id,
      offerId: redemption.offer_id,
      branchId: redemption.branch_id,
      isBonusApplied: redemption.is_bonus_applied || false,
      bonusDiscountApplied: redemption.bonus_discount_applied
        ? Number(redemption.bonus_discount_applied)
        : null,
      verifiedBy: redemption.verified_by,
      notes: redemption.notes,
      createdAt: redemption.created_at,
      status,
      offer: redemption.offers
        ? {
            id: redemption.offers.id,
            title: redemption.offers.title,
            discountType: redemption.offers.discount_type,
            discountValue: Number(redemption.offers.discount_value),
            imageUrl: redemption.offers.image_url,
          }
        : undefined,
      branch: redemption.merchant_branches
        ? {
            id: redemption.merchant_branches.id,
            branchName: redemption.merchant_branches.branch_name,
            address: redemption.merchant_branches.address,
            city: redemption.merchant_branches.city,
          }
        : undefined,
      merchant: redemption.merchant_branches?.merchants
        ? {
            id: redemption.merchant_branches.merchants.id,
            businessName: redemption.merchant_branches.merchants.business_name,
            logoPath: redemption.merchant_branches.merchants.logo_path,
            category: redemption.merchant_branches.merchants.category,
          }
        : undefined,
      student: redemption.students
        ? {
            id: redemption.students.id,
            parchiId: redemption.students.parchi_id,
            firstName: redemption.students.first_name,
            lastName: redemption.students.last_name,
          }
        : undefined,
    };
  }

  /**
   * Get order by clause for sorting
   */
  private getOrderBy(
    sort: string,
  ): any {
    switch (sort) {
      case 'oldest':
        return { created_at: 'asc' };
      case 'merchant':
        return { merchant_branches: { merchants: { business_name: 'asc' } } };
      case 'branch':
        return { merchant_branches: { branch_name: 'asc' } };
      case 'student':
        return { students: { parchi_id: 'asc' } };
      case 'status':
        return { verified_by: 'asc' };
      case 'newest':
      default:
        return { created_at: 'desc' };
    }
  }
  /**
   * Get daily redemption stats for a branch
   * Returns today's count and percentage change vs yesterday
   */
  async getBranchDailyStats(currentUser: CurrentUser) {
    if (!currentUser.branch?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branchId = currentUser.branch.id;
    const now = new Date();

    // Today's range (00:00:00 to now)
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Yesterday's range (00:00:00 to 23:59:59)
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    
    const endOfYesterday = new Date(startOfToday);
    endOfYesterday.setMilliseconds(-1);

    const [todayCount, yesterdayCount] = await Promise.all([
      this.prisma.redemptions.count({
        where: {
          branch_id: branchId,
          created_at: {
            gte: startOfToday,
          },
        },
      }),
      this.prisma.redemptions.count({
        where: {
          branch_id: branchId,
          created_at: {
            gte: startOfYesterday,
            lte: endOfYesterday,
          },
        },
      }),
    ]);

    let percentageChange = 0;
    let trend: 'up' | 'down' | 'neutral' = 'neutral';

    if (yesterdayCount > 0) {
      percentageChange = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
    } else if (todayCount > 0) {
      percentageChange = 100; // 100% increase if yesterday was 0 and today is > 0
    }

    if (percentageChange > 0) {
      trend = 'up';
    } else if (percentageChange < 0) {
      trend = 'down';
    }

    return createApiResponse(
      {
        todayCount,
        yesterdayCount,
        percentageChange: Math.round(percentageChange),
        trend,
      },
      API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS,
    );
  }

  /**
   * Get daily redemption details for a branch
   * Returns list of redemptions for today with student and offer details
   */
  async getBranchDailyRedemptionDetails(currentUser: CurrentUser) {
    if (!currentUser.branch?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branchId = currentUser.branch.id;
    const now = new Date();

    // Today's range (00:00:00 to now)
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const redemptions = await this.prisma.redemptions.findMany({
      where: {
        branch_id: branchId,
        created_at: {
          gte: startOfToday,
        },
      },
      include: {
        students: {
          select: {
            parchi_id: true,
          },
        },
        offers: {
          select: {
            title: true,
            discount_type: true,
            discount_value: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const formattedRedemptions = redemptions.map((redemption) => {
      let discountDetails = '';
      if (redemption.is_bonus_applied) {
        discountDetails = 'Bonus Reward';
      } else {
        const value = Number(redemption.offers.discount_value);
        if (redemption.offers.discount_type === 'percentage') {
          discountDetails = `${value}% off`;
        } else {
          discountDetails = `Rs. ${value} off`;
        }
      }

      return {
        id: redemption.id,
        parchiId: redemption.students.parchi_id,
        offerTitle: redemption.offers.title,
        discountDetails,
        createdAt: redemption.created_at,
      };
    });

    return createApiResponse(
      formattedRedemptions,
      API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS,
    );
  }

  /**
   * Get aggregated stats for a branch
   * Includes: Unique Students, Bonus Deals, Peak Hour, Hourly Chart Data
   */
  async getBranchAggregatedStats(currentUser: CurrentUser) {
    if (!currentUser.branch?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branchId = currentUser.branch.id;
    const now = new Date();

    // 1. Standard "Today" Range (00:00:00 to 23:59:59) for Summary Metrics
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // 2. Hourly Chart Range (Today 06:00 to Tomorrow 02:00)
    const chartStart = new Date(now);
    chartStart.setHours(6, 0, 0, 0);
    
    const chartEnd = new Date(now);
    chartEnd.setDate(chartEnd.getDate() + 1); // Tomorrow
    chartEnd.setHours(2, 0, 0, 0);

    // --- Parallel Queries ---
    const [todayRedemptions, chartRedemptions] = await Promise.all([
      // Query 1: For Unique Students & Bonus Deals (Standard Today)
      this.prisma.redemptions.findMany({
        where: {
          branch_id: branchId,
          created_at: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
        select: {
          student_id: true,
          is_bonus_applied: true,
        },
      }),

      // Query 2: For Hourly Chart & Peak Hour (6am - 2am)
      this.prisma.redemptions.findMany({
        where: {
          branch_id: branchId,
          created_at: {
            gte: chartStart,
            lte: chartEnd,
          },
        },
        select: {
          created_at: true,
        },
      }),
    ]);

    // --- Process Summary Metrics ---
    const uniqueStudents = new Set(todayRedemptions.map(r => r.student_id)).size;
    const bonusDealsCount = todayRedemptions.filter(r => r.is_bonus_applied).length;

    // --- Process Hourly Data ---
    // Initialize buckets for 6am to 2am (20 hours)
    // Map keys: 6, 7, ..., 23, 0, 1
    const hourlyMap = new Map<number, number>();
    const hours = [
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1
    ];
    hours.forEach(h => hourlyMap.set(h, 0));

    chartRedemptions.forEach(r => {
      if (r.created_at) {
        const h = new Date(r.created_at).getHours();
        if (hourlyMap.has(h)) {
          hourlyMap.set(h, (hourlyMap.get(h) || 0) + 1);
        }
      }
    });

    // Format for response
    const hourlyData = hours.map(h => ({
      hour: h,
      count: hourlyMap.get(h) || 0,
      label: h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`
    }));

    // --- Calculate Peak Hour ---
    let maxCount = -1;
    let peakHourLabel = 'N/A';
    
    hourlyData.forEach(d => {
      if (d.count > maxCount) {
        maxCount = d.count;
        peakHourLabel = d.label;
      }
    });

    if (maxCount === 0) peakHourLabel = 'N/A';

    return createApiResponse(
      {
        uniqueStudents,
        bonusDealsCount,
        peakHour: peakHourLabel,
        hourlyData,
      },
      API_RESPONSE_MESSAGES.REDEMPTION.GET_SUCCESS,
    );
  }
}

