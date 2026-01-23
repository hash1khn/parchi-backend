import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { CreateRedemptionDto } from './dto/create-redemption.dto';
import { UpdateRedemptionDto } from './dto/update-redemption.dto';
import { RejectRedemptionAttemptDto } from './dto/reject-redemption-attempt.dto';
import { QueryRedemptionsDto } from './dto/query-redemptions.dto';
import { ROLES } from '../../constants/app.constants';
import { CurrentUser } from '../../types/global.types';
import {
  calculatePaginationMeta,
  calculateSkip,
  PaginationMeta,
} from '../../utils/pagination.util';
import { SohoStrategy } from './strategies/soho.strategy';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

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
  discountDetails?: string;
}

export interface RedemptionStatsResponse {
  totalRedemptions: number;
  bonusesUnlocked: number;
  leaderboardPosition: number;
}

@Injectable()
export class RedemptionsService {
  // Time window to prevent duplicate redemptions (5 seconds)
  private readonly DUPLICATE_PREVENTION_WINDOW_MS = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sohoStrategy: SohoStrategy,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Create redemption
   * Branch staff only
   */
  async createRedemption(
    createDto: CreateRedemptionDto,
    currentUser: CurrentUser,
  ): Promise<RedemptionResponse> {
    // Verify branch staff has a branch
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    const branchId = currentUser.branch_id;

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
              const dayNames = [
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
              ];
              throw new BadRequestException(
                `This offer is not available on ${dayNames[today]}. It is only available on: ${allowedDays.map((d) => dayNames[d]).join(', ')}`,
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
              isWithinWindow =
                currentTime >= startMinutes && currentTime <= endMinutes;
            } else {
              // Time window spans midnight (e.g., 22:00 - 02:00)
              isWithinWindow =
                currentTime >= startMinutes || currentTime <= endMinutes;
            }

            if (!isWithinWindow) {
              const formatTimeString = (time: Date): string => {
                const date = new Date(time);
                const hours = date.getUTCHours().toString().padStart(2, '0');
                const minutes = date
                  .getUTCMinutes()
                  .toString()
                  .padStart(2, '0');
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

        // 11. Calculate bonus discount OR Strategy Discount
        let isBonusApplied = false;
        let bonusDiscountApplied: number | null = null;
        let strategyNote: string | null = null;
        let calculatedStrategyDiscount: number | undefined;

        // CHECK FOR STRATEGY FIRST
        if ((offer as any).redemption_strategy === 'soho_hierarchical') {
          const strategyResult = await this.sohoStrategy.calculateDiscount({
            studentId: student.id,
            merchantId: branch.merchant_id,
            offerId: createDto.offerId,
            tx,
          });

          // Strategy Result Overrides Standard Logic
          calculatedStrategyDiscount = strategyResult.discountValue;
          strategyNote = strategyResult.note || null;

          // Treat Strategy overrides as "Bonus" for storage purposes so the value persists
          // This ensures historical redemptions show the correct % (e.g. 30%, 40%) instead of the static offer % (20%)
          bonusDiscountApplied = calculatedStrategyDiscount;
          isBonusApplied = true;
        }

        const bonusSettings = await tx.branch_bonus_settings.findUnique({
          where: { branch_id: branchId },
        });

        if (
          !(offer as any).redemption_strategy &&
          bonusSettings &&
          bonusSettings.is_active
        ) {
          const studentBranchStats = await tx.student_branch_stats.findUnique({
            where: {
              student_id_branch_id: {
                student_id: student.id,
                branch_id: branchId,
              },
            },
          });

          const redemptionCount = studentBranchStats?.redemption_count || 0;

          // Check if this redemption qualifies for bonus (e.g. 5th redemption)
          // Logic: (current_count + 1) % required === 0
          if (
            (redemptionCount + 1) % bonusSettings.redemptions_required ===
            0
          ) {
            isBonusApplied = true;

            if (bonusSettings.discount_type === 'percentage') {
              bonusDiscountApplied = Number(bonusSettings.discount_value);
              if (bonusSettings.max_discount_amount) {
                bonusDiscountApplied = Math.min(
                  bonusDiscountApplied,
                  Number(bonusSettings.max_discount_amount),
                );
              }
            } else if (bonusSettings.discount_type === 'fixed') {
              bonusDiscountApplied = Number(bonusSettings.discount_value);
            } else if (bonusSettings.discount_type === 'item') {
              // Item type - no discount, just additional item
              bonusDiscountApplied = 0;
            }
          }
        }

        // 12. Calculate savings (offer discount + bonus)
        let totalSavings = 0;

        if (typeof calculatedStrategyDiscount !== 'undefined') {
          totalSavings = calculatedStrategyDiscount;
        } else {
          const offerDiscount = Number(offer.discount_value);
          totalSavings = isBonusApplied
            ? offerDiscount + (bonusDiscountApplied || 0)
            : offerDiscount;
        }

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
            notes: strategyNote
              ? createDto.notes
                ? `${strategyNote} | ${createDto.notes}`
                : strategyNote
              : createDto.notes || null,
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
        const existingMerchantStats = await tx.student_merchant_stats.findFirst(
          {
            where: {
              student_id: student.id,
              merchant_id: branch.merchant_id,
            },
          },
        );

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
                user_id: true,
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

    const formattedRedemption = await this.formatRedemptionResponse(redemption);

    // Send personal notification to the student
    try {
      // Calculate savings percentage for the message
      let savingsPercentage = 0;
      const discountValue = Number(formattedRedemption.offer?.discountValue || 0);
      const bonusValue = Number(formattedRedemption.bonusDiscountApplied || 0);

      if (
        formattedRedemption.offer?.discountType === 'percentage' &&
        !formattedRedemption.isBonusApplied
      ) {
        savingsPercentage = discountValue;
      } else if (formattedRedemption.isBonusApplied) {
        // If bonus applied, try to use the bonus value if it looks like a percentage (<= 100)
        // Otherwise fallback to base discount
        if (bonusValue <= 100) {
          savingsPercentage = bonusValue;
        } else {
          savingsPercentage = discountValue;
        }
      } else {
        savingsPercentage = discountValue;
      }
      
      const branchName = formattedRedemption.branch?.branchName || 'Parchi Partner';
      const notificationTitle = 'Parchi lag gayi!';
      const notificationBody = `You got a ${savingsPercentage}% discount at ${branchName}!`;

      
      // Get API base URL for image
      // Note: Assuming API_BASE_URL is set in .env. If running locally on emulator, 
      // localhost might not be reachable from device unless using IP.
      const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:8080';
      // Ensure no double slash
      const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      const imageUrl = `${baseUrl}/public/notifs-icon.png`;

      // We need to access the student's user_id which we added to the select
      const studentUserId = (redemption as any).students?.user_id;

      if (studentUserId) {
        await this.notificationsService.sendPersonalNotification(
          studentUserId,
          notificationTitle,
          notificationBody,
          imageUrl, // Image URL
        );
      }
    } catch (error) {
      console.error('Failed to send redemption notification', error);
      // We don't throw here to avoid failing the redemption response
    }

    return formattedRedemption;
  }

  /**
   * Reject redemption attempt
   * Branch staff only
   */
  async rejectRedemptionAttempt(
    rejectDto: RejectRedemptionAttemptDto,
    currentUser: CurrentUser,
  ): Promise<RedemptionResponse> {
    // Verify branch staff has a branch
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    const branchId = currentUser.branch_id;

    // Normalize parchi ID (uppercase, trim)
    const normalizedParchiId = rejectDto.parchiId.trim().toUpperCase();

    if (!normalizedParchiId || !normalizedParchiId.startsWith('PK-')) {
      throw new BadRequestException(
        API_RESPONSE_MESSAGES.REDEMPTION.INVALID_PARCHI_ID,
      );
    }

    // Verify offer exists
    const offer = await this.prisma.offers.findUnique({
      where: { id: rejectDto.offerId },
    });

    if (!offer) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.REDEMPTION.OFFER_NOT_FOUND,
      );
    }

    // 1. Find student by parchi ID
    const student = await this.prisma.students.findUnique({
      where: { parchi_id: normalizedParchiId },
      select: {
        id: true,
        parchi_id: true,
        first_name: true,
        last_name: true,
        university: true,
        cnic: true,
        user_id: true,
        verification_status: true,
      }
    });

    if (!student) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.REDEMPTION.STUDENT_NOT_FOUND,
      );
    }

    // Log the rejection to audit logs ONLY
    await this.auditService.logAction(
      'REJECT_REDEMPTION_ATTEMPT',
      'redemptions',
      undefined, // No record ID
      {
        student: {
          id: student.id,
          parchiId: student.parchi_id,
          firstName: student.first_name,
          lastName: student.last_name,
        },
        offer: {
          id: offer.id,
          title: offer.title,
        },
        branchId,
        reason: rejectDto.rejectionReason,
      },
      currentUser.id,
    );
    
    // Send rejection notification
    try {
        const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:8080';
        const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
        const imageUrl = `${baseUrl}/public/notifs-icon.png`;

        await this.notificationsService.sendPersonalNotification(
            student.user_id,
            'Parchi nahi lag payi :(',
            `Your redemption was rejected. Reason: ${rejectDto.rejectionReason}`,
            imageUrl
        );
    } catch (error) {
        console.error('Failed to send rejection notification', error);
    }

    // Return a dummy rejected response structure since we don't save rejected redemptions in redemptions table anymore
    return {
      id: 'rejected',
      studentId: student.id,
      offerId: offer.id,
      branchId,
      isBonusApplied: false,
      bonusDiscountApplied: null,
      verifiedBy: currentUser.id,
      notes: rejectDto.rejectionReason,
      createdAt: new Date(),
      status: 'rejected',
      student: {
        id: student.id,
        parchiId: student.parchi_id,
        firstName: student.first_name,
        lastName: student.last_name,
      },
    } as RedemptionResponse;

  }

  /**
   * Get student's redemptions (history)
   * Student only
   */
  async getStudentRedemptions(
    currentUser: CurrentUser,
    queryDto: QueryRedemptionsDto,
  ): Promise<{ items: RedemptionResponse[]; pagination: PaginationMeta }> {
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
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
          mode: 'insensitive',
        } as Prisma.StringNullableFilter;
      } else if (queryDto.status === 'pending') {
        whereClause.verified_by = null;
        // For pending, notes should not contain REJECTED (case-insensitive)
        // Use OR to handle null notes or notes without REJECTED
        whereClause.OR = [
          { notes: null },
          { notes: { not: { contains: 'REJECTED' } } },
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
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
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

    return {
      items: formattedRedemptions,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }

  /**
   * Get redemption by ID (student)
   * Student only
   */
  async getRedemptionById(
    id: string,
    currentUser: CurrentUser,
  ): Promise<RedemptionResponse> {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
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
          select: {
            id: true,
            branch_name: true,
            address: true,
            city: true,
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND);
    }

    if (redemption.student_id !== student.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    return this.formatRedemptionResponse(redemption);
  }

  /**
   * Get branch redemptions (history)
   * Branch staff only
   */
  async getBranchRedemptions(
    currentUser: CurrentUser,
    queryDto: QueryRedemptionsDto,
  ): Promise<{ items: RedemptionResponse[]; pagination: PaginationMeta }> {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    const branchId = currentUser.branch_id;
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
        whereClause.notes = {
          contains: 'REJECTED',
          mode: 'insensitive',
        } as Prisma.StringNullableFilter;
      } else if (queryDto.status === 'pending') {
        whereClause.verified_by = null;
        // For pending, notes should not contain REJECTED (case-insensitive)
        // Use OR to handle null notes or notes without REJECTED
        whereClause.OR = [
          { notes: null },
          { notes: { not: { contains: 'REJECTED' } } },
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
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
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

    return {
      items: formattedRedemptions,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }

  /**
   * Get redemption by ID (branch)
   * Branch staff only
   */
  async getBranchRedemptionById(
    id: string,
    currentUser: CurrentUser,
  ): Promise<RedemptionResponse> {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch_id) {
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
          select: {
            id: true,
            branch_name: true,
            address: true,
            city: true,
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND);
    }

    if (redemption.branch_id !== currentUser.branch_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.BRANCH_ACCESS_DENIED,
      );
    }

    return this.formatRedemptionResponse(redemption);
  }

  /**
   * Reject redemption
   * Branch staff only
   */
  async rejectRedemption(
    id: string,
    updateDto: UpdateRedemptionDto,
    currentUser: CurrentUser,
  ): Promise<RedemptionResponse> {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    if (!currentUser.branch_id) {
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
        throw new NotFoundException(API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND);
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
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
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

    return this.formatRedemptionResponse(redemption);
  }

  /**
   * Get all redemptions (Admin)
   * Admin only
   */
  async getAllRedemptions(
    queryDto: QueryRedemptionsDto,
  ): Promise<{ items: RedemptionResponse[]; pagination: PaginationMeta }> {
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
        whereClause.notes = {
          contains: 'REJECTED',
          mode: 'insensitive',
        } as Prisma.StringNullableFilter;
      } else if (queryDto.status === 'pending') {
        whereClause.verified_by = null;
        // For pending, notes should not contain REJECTED (case-insensitive)
        // Use OR to handle null notes or notes without REJECTED
        whereClause.OR = [
          { notes: null },
          { notes: { not: { contains: 'REJECTED' } } },
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
            select: {
              id: true,
              branch_name: true,
              address: true,
              city: true,
              merchants: {
                select: {
                  id: true,
                  business_name: true,
                  logo_path: true,
                  category: true,
                },
              },
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

    return {
      items: formattedRedemptions,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }

  /**
   * Get redemption by ID (Admin)
   * Admin only
   */
  async getAdminRedemptionById(id: string): Promise<RedemptionResponse> {
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
          select: {
            id: true,
            branch_name: true,
            address: true,
            city: true,
            merchants: {
              select: {
                id: true,
                business_name: true,
                logo_path: true,
                category: true,
              },
            },
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.REDEMPTION.NOT_FOUND);
    }

    return this.formatRedemptionResponse(redemption);
  }

  /**
   * Get student redemption statistics
   * Student only
   */
  async getStudentRedemptionStats(
    currentUser: CurrentUser,
  ): Promise<RedemptionStatsResponse> {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.REDEMPTION.ACCESS_DENIED,
      );
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
    });

    if (!student) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.STUDENT.NOT_FOUND);
    }

    // 1. Total Redemptions
    const totalRedemptions = student.total_redemptions || 0;

    // 2. Bonuses Unlocked
    const bonusesUnlocked = await this.prisma.redemptions.count({
      where: {
        student_id: student.id,
        is_bonus_applied: true,
      },
    });

    // 3. Leaderboard Position (Rank based on total_savings)
    const higherSavingsCount = await this.prisma.students.count({
      where: {
        total_savings: {
          gt: student.total_savings || 0,
        },
      },
    });
    const leaderboardPosition = higherSavingsCount + 1;

    return {
      totalRedemptions,
      bonusesUnlocked,
      leaderboardPosition,
    };
  }

  /**
   * Format redemption response
   */
  private formatRedemptionResponse(redemption: any): RedemptionResponse {
    const status =
      redemption.notes && redemption.notes.toUpperCase().includes('REJECTED')
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
          discountValue: redemption.bonus_discount_applied
            ? Number(redemption.bonus_discount_applied)
            : Number(redemption.offers.discount_value),
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
      discountDetails:
        redemption.is_bonus_applied && redemption.bonus_discount_applied
          ? `(${Number(redemption.bonus_discount_applied)}% OFF)`
          : undefined,
    };
  }

  /**
   * Get order by clause for sorting
   */
  private getOrderBy(sort: string): any {
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
    if (!currentUser.branch_id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branchId = currentUser.branch_id;
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

    return {
      todayCount,
      yesterdayCount,
      percentageChange: Math.round(percentageChange),
      trend,
    };
  }

  /**
   * Get daily redemption details for a branch
   * Returns list of redemptions for today with student and offer details
   */
  async getBranchDailyRedemptionDetails(currentUser: CurrentUser) {
    if (!currentUser.branch_id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branchId = currentUser.branch_id;
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
      let offerTitle = redemption.offers.title;

      if (redemption.is_bonus_applied) {
        // For bonus redemptions, show the actual bonus discount amount
        const bonusValue = Number(redemption.bonus_discount_applied || 0);
        if (bonusValue > 0) {
          // Bonus could be percentage or fixed amount
          // Assume percentage if value <= 100, otherwise fixed amount
          if (bonusValue <= 100) {
            discountDetails = `${bonusValue}% off`;
            offerTitle = `${bonusValue}% OFF - Loyalty Bonus`;
          } else {
            discountDetails = `Rs. ${bonusValue} off`;
            offerTitle = `Rs. ${bonusValue} OFF - Loyalty Bonus`;
          }
        } else {
          discountDetails = 'Bonus Reward';
          offerTitle = 'Loyalty Bonus Reward';
        }
      } else {
        // Regular redemption - use offer discount
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
        offerTitle,
        discountDetails,
        createdAt: redemption.created_at,
        isBonusApplied: redemption.is_bonus_applied,
      };
    });

    return formattedRedemptions;
  }

  /**
   * Get aggregated stats for a branch
   * Includes: Unique Students, Bonus Deals, Peak Hour, Hourly Chart Data
   */
  async getBranchAggregatedStats(currentUser: CurrentUser) {
    if (!currentUser.branch_id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branchId = currentUser.branch_id;
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
    const uniqueStudents = new Set(todayRedemptions.map((r) => r.student_id))
      .size;
    const bonusDealsCount = todayRedemptions.filter(
      (r) => r.is_bonus_applied,
    ).length;

    // --- Process Hourly Data ---
    // Initialize buckets for 6am to 2am (20 hours)
    // Map keys: 6, 7, ..., 23, 0, 1
    const hourlyMap = new Map<number, number>();
    const hours = [
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1,
    ];
    hours.forEach((h) => hourlyMap.set(h, 0));

    chartRedemptions.forEach((r) => {
      if (r.created_at) {
        const h = new Date(r.created_at).getHours();
        if (hourlyMap.has(h)) {
          hourlyMap.set(h, (hourlyMap.get(h) || 0) + 1);
        }
      }
    });

    // Format for response
    const hourlyData = hours.map((h) => ({
      hour: h,
      count: hourlyMap.get(h) || 0,
      label:
        h === 0
          ? '12 AM'
          : h === 12
            ? '12 PM'
            : h > 12
              ? `${h - 12} PM`
              : `${h} AM`,
    }));

    // --- Calculate Peak Hour ---
    let maxCount = -1;
    let peakHourLabel = 'N/A';

    hourlyData.forEach((d) => {
      if (d.count > maxCount) {
        maxCount = d.count;
        peakHourLabel = d.label;
      }
    });

    if (maxCount === 0) peakHourLabel = 'N/A';

    return {
      uniqueStudents,
      bonusDealsCount,
      peakHour: peakHourLabel,
      hourlyData,
    };
  }
}
