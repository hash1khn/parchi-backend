import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiResponse, PaginatedResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { AssignBranchesDto } from './dto/assign-branches.dto';
import { ApproveRejectOfferDto } from './dto/approve-reject-offer.dto';
import { ROLES } from '../../constants/app.constants';
import { CurrentUser } from '../../types/global.types';
import {
  calculatePaginationMeta,
  calculateSkip,
} from '../../utils/pagination.util';

export interface OfferResponse {
  id: string;
  merchantId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountType: string;
  discountValue: number;
  minOrderValue: number | null;
  maxDiscountAmount: number | null;
  termsConditions: string | null;
  validFrom: Date;
  validUntil: Date;
  dailyLimit: number | null;
  totalLimit: number | null;
  currentRedemptions: number;
  status: string;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  branches?: Array<{
    branchId: string;
    branchName: string;
    isActive: boolean;
  }>;
  merchant?: {
    id: string;
    businessName: string;
    logoPath: string | null;
    category: string | null;
  };
}

export interface OfferAnalyticsResponse {
  totalRedemptions: number;
  currentRedemptions: number;
  remainingRedemptions: number | null;
  redemptionsByBranch: Array<{
    branchId: string;
    branchName: string;
    redemptionCount: number;
  }>;
  redemptionsByDate: Array<{
    date: string;
    count: number;
  }>;
}

export interface OfferResponseWithDistance extends OfferResponse {
  distance?: number;
}

export interface OfferDetailsResponse extends OfferResponse {
  branches: Array<{
    branchId: string;
    branchName: string;
    address: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
    distance?: number;
    isActive: boolean;
  }>;
}

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new offer
   * Merchant Corporate only
   */
  async createOffer(
    createDto: CreateOfferDto,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<OfferResponse>> {
    // Verify user is a corporate merchant
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    if (!currentUser.merchant?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant.id;

    // Validate date range
    const validFrom = new Date(createDto.validFrom);
    const validUntil = new Date(createDto.validUntil);
    if (validUntil <= validFrom) {
      throw new BadRequestException(
        API_RESPONSE_MESSAGES.OFFER.INVALID_DATE_RANGE,
      );
    }

    // Validate discount value for percentage
    if (
      createDto.discountType === 'percentage' &&
      createDto.discountValue > 100
    ) {
      throw new BadRequestException(
        API_RESPONSE_MESSAGES.OFFER.INVALID_DISCOUNT_VALUE,
      );
    }

    // Validate branches if provided
    if (createDto.branchIds && createDto.branchIds.length > 0) {
      const branches = await this.prisma.merchant_branches.findMany({
        where: {
          id: { in: createDto.branchIds },
          merchant_id: merchantId,
        },
      });

      if (branches.length !== createDto.branchIds.length) {
        throw new BadRequestException(
          API_RESPONSE_MESSAGES.OFFER.BRANCH_NOT_BELONGS_TO_MERCHANT,
        );
      }
    }

    // Create offer
    const offer = await this.prisma.$transaction(async (tx) => {
      const newOffer = await tx.offers.create({
        data: {
          merchant_id: merchantId,
          title: createDto.title,
          description: createDto.description || null,
          image_url: createDto.imageUrl || null,
          discount_type: createDto.discountType,
          discount_value: createDto.discountValue,
          min_order_value: createDto.minOrderValue || 0,
          max_discount_amount: createDto.maxDiscountAmount || null,
          terms_conditions: createDto.termsConditions || null,
          valid_from: validFrom,
          valid_until: validUntil,
          daily_limit: createDto.dailyLimit || null,
          total_limit: createDto.totalLimit || null,
          current_redemptions: 0,
          status: 'active',
          created_by: currentUser.id,
        },
      });

      // Assign branches if provided
      if (createDto.branchIds && createDto.branchIds.length > 0) {
        await tx.offer_branches.createMany({
          data: createDto.branchIds.map((branchId) => ({
            offer_id: newOffer.id,
            branch_id: branchId,
            is_active: true,
          })),
        });
      } else {
        // If no branches specified, assign to all merchant branches
        const allBranches = await tx.merchant_branches.findMany({
          where: {
            merchant_id: merchantId,
            is_active: true,
          },
        });

        if (allBranches.length > 0) {
          await tx.offer_branches.createMany({
            data: allBranches.map((branch) => ({
              offer_id: newOffer.id,
              branch_id: branch.id,
              is_active: true,
            })),
          });
        }
      }

      return newOffer;
    });

    // Fetch created offer with relations
    const offerWithRelations = await this.prisma.offers.findUnique({
      where: { id: offer.id },
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    return {
      data: this.formatOfferResponse(offerWithRelations),
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.CREATE_SUCCESS,
    };
  }

  /**
   * Get all offers for a merchant
   * Merchant Corporate only
   */
  async getMerchantOffers(
    currentUser: CurrentUser,
    status?: 'active' | 'inactive',
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<OfferResponse>> {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    if (!currentUser.merchant?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant.id;
    const skip = calculateSkip(page, limit);

    const whereClause: any = {
      merchant_id: merchantId,
    };

    if (status) {
      whereClause.status = status;
    }

    const [offers, total] = await Promise.all([
      this.prisma.offers.findMany({
        where: whereClause,
        include: {
          offer_branches: {
            include: {
              merchant_branches: {
                select: {
                  id: true,
                  branch_name: true,
                  is_active: true,
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
      this.prisma.offers.count({
        where: whereClause,
      }),
    ]);

    const formattedOffers = offers.map((offer) =>
      this.formatOfferResponse(offer),
    );

    return {
      data: {
        data: formattedOffers,
        pagination: calculatePaginationMeta(total, page, limit),
      },
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS,
    };
  }

  /**
   * Get offer by ID
   * Merchant Corporate only (their own offers)
   */
  async getOfferById(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<OfferResponse>> {
    const offer = await this.prisma.offers.findUnique({
      where: { id },
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
      if (offer.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    return {
      data: this.formatOfferResponse(offer),
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.GET_SUCCESS,
    };
  }

  /**
   * Update offer
   * Merchant Corporate only (their own offers)
   */
  async updateOffer(
    id: string,
    updateDto: UpdateOfferDto,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<OfferResponse>> {
    // Check if offer exists
    const offer = await this.prisma.offers.findUnique({
      where: { id },
      include: {
        merchants: true,
      },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
      if (offer.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    // Validate date range if both dates are provided
    if (updateDto.validFrom && updateDto.validUntil) {
      const validFrom = new Date(updateDto.validFrom);
      const validUntil = new Date(updateDto.validUntil);
      if (validUntil <= validFrom) {
        throw new BadRequestException(
          API_RESPONSE_MESSAGES.OFFER.INVALID_DATE_RANGE,
        );
      }
    } else if (updateDto.validFrom) {
      const validFrom = new Date(updateDto.validFrom);
      const validUntil = new Date(offer.valid_until);
      if (validUntil <= validFrom) {
        throw new BadRequestException(
          API_RESPONSE_MESSAGES.OFFER.INVALID_DATE_RANGE,
        );
      }
    } else if (updateDto.validUntil) {
      const validFrom = new Date(offer.valid_from);
      const validUntil = new Date(updateDto.validUntil);
      if (validUntil <= validFrom) {
        throw new BadRequestException(
          API_RESPONSE_MESSAGES.OFFER.INVALID_DATE_RANGE,
        );
      }
    }

    // Validate discount value for percentage
    if (
      (updateDto.discountType === 'percentage' ||
        offer.discount_type === 'percentage') &&
      updateDto.discountValue
    ) {
      if (updateDto.discountValue > 100) {
        throw new BadRequestException(
          API_RESPONSE_MESSAGES.OFFER.INVALID_DISCOUNT_VALUE,
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (updateDto.title !== undefined) {
      updateData.title = updateDto.title;
    }
    if (updateDto.description !== undefined) {
      updateData.description = updateDto.description;
    }
    if (updateDto.imageUrl !== undefined) {
      updateData.image_url = updateDto.imageUrl;
    }
    if (updateDto.discountType !== undefined) {
      updateData.discount_type = updateDto.discountType;
    }
    if (updateDto.discountValue !== undefined) {
      updateData.discount_value = updateDto.discountValue;
    }
    if (updateDto.minOrderValue !== undefined) {
      updateData.min_order_value = updateDto.minOrderValue;
    }
    if (updateDto.maxDiscountAmount !== undefined) {
      updateData.max_discount_amount = updateDto.maxDiscountAmount;
    }
    if (updateDto.termsConditions !== undefined) {
      updateData.terms_conditions = updateDto.termsConditions;
    }
    if (updateDto.validFrom !== undefined) {
      updateData.valid_from = new Date(updateDto.validFrom);
    }
    if (updateDto.validUntil !== undefined) {
      updateData.valid_until = new Date(updateDto.validUntil);
    }
    if (updateDto.dailyLimit !== undefined) {
      updateData.daily_limit = updateDto.dailyLimit;
    }
    if (updateDto.totalLimit !== undefined) {
      updateData.total_limit = updateDto.totalLimit;
    }
    if (updateDto.status !== undefined) {
      updateData.status = updateDto.status;
    }

    // Update offer
    const updatedOffer = await this.prisma.offers.update({
      where: { id },
      data: updateData,
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    return {
      data: this.formatOfferResponse(updatedOffer),
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.UPDATE_SUCCESS,
    };
  }

  /**
   * Toggle offer status (active/inactive)
   * Merchant Corporate only (their own offers)
   */
  async toggleOfferStatus(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<OfferResponse>> {
    // Check if offer exists
    const offer = await this.prisma.offers.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
      if (offer.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    // Toggle status
    const newStatus = offer.status === 'active' ? 'inactive' : 'active';

    // Update offer status
    const updatedOffer = await this.prisma.offers.update({
      where: { id },
      data: { status: newStatus },
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
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

    return {
      data: this.formatOfferResponse(updatedOffer),
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.TOGGLE_SUCCESS,
    };
  }

  /**
   * Delete offer
   * Merchant Corporate only (their own offers)
   */
  async deleteOffer(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<null>> {
    // Check if offer exists
    const offer = await this.prisma.offers.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
      if (offer.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    // Delete offer (cascade will handle related records)
    await this.prisma.offers.delete({
      where: { id },
    });

    return {
      data: null,
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.DELETE_SUCCESS,
    };
  }

  /**
   * Assign offer to branches
   * Merchant Corporate only
   */
  async assignBranchesToOffer(
    id: string,
    assignDto: AssignBranchesDto,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<OfferResponse>> {
    // Check if offer exists
    const offer = await this.prisma.offers.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
      if (offer.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    // Validate branches belong to the merchant
    const branches = await this.prisma.merchant_branches.findMany({
      where: {
        id: { in: assignDto.branchIds },
        merchant_id: offer.merchant_id,
      },
    });

    if (branches.length !== assignDto.branchIds.length) {
      throw new BadRequestException(
        API_RESPONSE_MESSAGES.OFFER.BRANCH_NOT_BELONGS_TO_MERCHANT,
      );
    }

    // Assign branches (upsert to handle duplicates)
    await this.prisma.$transaction(async (tx) => {
      // Remove existing assignments for these branches
      await tx.offer_branches.deleteMany({
        where: {
          offer_id: id,
          branch_id: { in: assignDto.branchIds },
        },
      });

      // Create new assignments
      await tx.offer_branches.createMany({
        data: assignDto.branchIds.map((branchId) => ({
          offer_id: id,
          branch_id: branchId,
          is_active: true,
        })),
      });
    });

    // Fetch updated offer
    const updatedOffer = await this.prisma.offers.findUnique({
      where: { id },
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    return {
      data: this.formatOfferResponse(updatedOffer!),
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.BRANCHES_ASSIGNED_SUCCESS,
    };
  }

  /**
   * Remove offer from branches
   * Merchant Corporate only
   */
  async removeBranchesFromOffer(
    id: string,
    assignDto: AssignBranchesDto,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<OfferResponse>> {
    // Check if offer exists
    const offer = await this.prisma.offers.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
      if (offer.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    // Remove branch assignments
    await this.prisma.offer_branches.deleteMany({
      where: {
        offer_id: id,
        branch_id: { in: assignDto.branchIds },
      },
    });

    // Fetch updated offer
    const updatedOffer = await this.prisma.offers.findUnique({
      where: { id },
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    return {
      data: this.formatOfferResponse(updatedOffer!),
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.BRANCHES_REMOVED_SUCCESS,
    };
  }

  /**
   * Get offer analytics
   * Merchant Corporate only
   */
  async getOfferAnalytics(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<OfferAnalyticsResponse>> {
    // Check if offer exists
    const offer = await this.prisma.offers.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
      if (offer.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.OFFER.ACCESS_DENIED,
      );
    }

    // Get redemptions by branch
    const redemptionsByBranch = await this.prisma.redemptions.groupBy({
      by: ['branch_id'],
      where: {
        offer_id: id,
      },
      _count: {
        id: true,
      },
    });

    // Get branch details
    const branchIds = redemptionsByBranch.map((r) => r.branch_id);
    const branches = await this.prisma.merchant_branches.findMany({
      where: {
        id: { in: branchIds },
      },
      select: {
        id: true,
        branch_name: true,
      },
    });

    const branchMap = new Map(
      branches.map((b) => [b.id, b.branch_name]),
    );

    // Get redemptions by date (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const redemptionsByDateRaw = await this.prisma.redemptions.groupBy({
      by: ['created_at'],
      where: {
        offer_id: id,
        created_at: {
          gte: thirtyDaysAgo,
        },
      },
      _count: {
        id: true,
      },
    });

    // Group by date (day)
    const dateMap = new Map<string, number>();
    redemptionsByDateRaw.forEach((r) => {
      const date = new Date(r.created_at!).toISOString().split('T')[0];
      dateMap.set(date, (dateMap.get(date) || 0) + r._count.id);
    });

    const redemptionsByDate = Array.from(dateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalRedemptions = offer.current_redemptions || 0;
    const remainingRedemptions = offer.total_limit
      ? offer.total_limit - totalRedemptions
      : null;

    return {
      data: {
        totalRedemptions,
        currentRedemptions: totalRedemptions,
        remainingRedemptions,
        redemptionsByBranch: redemptionsByBranch.map((r) => ({
          branchId: r.branch_id,
          branchName: branchMap.get(r.branch_id) || 'Unknown',
          redemptionCount: r._count.id,
        })),
        redemptionsByDate,
      },
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.ANALYTICS_SUCCESS,
    };
  }

  /**
   * Get all offers (Admin)
   * Admin only
   */
  async getAllOffers(
    status?: 'active' | 'inactive',
    merchantId?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<OfferResponse>> {
    const skip = calculateSkip(page, limit);

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }
    if (merchantId) {
      whereClause.merchant_id = merchantId;
    }

    const [offers, total] = await Promise.all([
      this.prisma.offers.findMany({
        where: whereClause,
        include: {
          offer_branches: {
            include: {
              merchant_branches: {
                select: {
                  id: true,
                  branch_name: true,
                  is_active: true,
                },
              },
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
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.offers.count({
        where: whereClause,
      }),
    ]);

    const formattedOffers = offers.map((offer) =>
      this.formatOfferResponse(offer),
    );

    return {
      data: {
        data: formattedOffers,
        pagination: calculatePaginationMeta(total, page, limit),
      },
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS,
    };
  }

  /**
   * Get offer by ID (Admin)
   * Admin only
   */
  async getOfferByIdAdmin(
    id: string,
  ): Promise<ApiResponse<OfferResponse>> {
    const offer = await this.prisma.offers.findUnique({
      where: { id },
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    return {
      data: this.formatOfferResponse(offer),
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.GET_SUCCESS,
    };
  }

  /**
   * Approve or reject offer (Admin)
   * Admin only
   */
  async approveRejectOffer(
    id: string,
    approveRejectDto: ApproveRejectOfferDto,
  ): Promise<ApiResponse<OfferResponse>> {
    const offer = await this.prisma.offers.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Update offer status
    const status = approveRejectDto.action === 'approve' ? 'active' : 'inactive';

    const updatedOffer = await this.prisma.offers.update({
      where: { id },
      data: { status },
      include: {
        offer_branches: {
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
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

    return {
      data: this.formatOfferResponse(updatedOffer),
      status: 200,
      message:
        approveRejectDto.action === 'approve'
          ? API_RESPONSE_MESSAGES.OFFER.APPROVE_SUCCESS
          : API_RESPONSE_MESSAGES.OFFER.REJECT_SUCCESS,
    };
  }

  /**
   * Delete offer (Admin)
   * Admin only
   */
  async deleteOfferAdmin(id: string): Promise<ApiResponse<null>> {
    const offer = await this.prisma.offers.findUnique({
      where: { id },
    });

    if (!offer) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Delete offer (cascade will handle related records)
    await this.prisma.offers.delete({
      where: { id },
    });

    return {
      data: null,
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.DELETE_SUCCESS,
    };
  }

  /**
   * Get active offers for students
   * Student only
   */
  async getActiveOffersForStudents(
    category?: string,
    latitude?: number,
    longitude?: number,
    radius: number = 10,
    sort?: 'popularity' | 'proximity' | 'newest',
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<OfferResponseWithDistance>> {
    const skip = calculateSkip(page, limit);
    const now = new Date();

    // Build where clause for active offers
    const whereClause: any = {
      status: 'active',
      valid_from: { lte: now },
      valid_until: { gte: now },
    };

    // Filter by merchant category if provided
    if (category) {
      whereClause.merchants = {
        category: category,
      };
    }

    // Get all active offers with merchant and branch info
    const offers = await this.prisma.offers.findMany({
      where: whereClause,
      include: {
        offer_branches: {
          where: {
            is_active: true,
          },
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                latitude: true,
                longitude: true,
                address: true,
                city: true,
                is_active: true,
              },
            },
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

    // Format offers and calculate distances if coordinates provided
    let formattedOffers: OfferResponseWithDistance[] = offers.map((offer) => {
      const formatted = this.formatOfferResponse(offer);
      
      // Calculate minimum distance to any branch if coordinates provided
      if (latitude !== undefined && longitude !== undefined) {
        const distances = offer.offer_branches
          .filter((ob) => ob.merchant_branches.latitude && ob.merchant_branches.longitude)
          .map((ob) => {
            const branchLat = Number(ob.merchant_branches.latitude);
            const branchLng = Number(ob.merchant_branches.longitude);
            return this.calculateDistance(
              latitude,
              longitude,
              branchLat,
              branchLng,
            );
          });
        
        const minDistance = distances.length > 0 ? Math.min(...distances) : undefined;
        return { ...formatted, distance: minDistance } as OfferResponseWithDistance;
      }
      
      return formatted as OfferResponseWithDistance;
    });

    // Filter by radius if coordinates provided
    if (latitude !== undefined && longitude !== undefined) {
      formattedOffers = formattedOffers.filter(
        (offer) => offer.distance !== undefined && offer.distance <= radius,
      );
    }

    // Sort offers
    if (sort === 'popularity') {
      formattedOffers.sort((a, b) => b.currentRedemptions - a.currentRedemptions);
    } else if (sort === 'proximity' && latitude !== undefined && longitude !== undefined) {
      formattedOffers.sort((a, b) => {
        const distA = a.distance ?? Infinity;
        const distB = b.distance ?? Infinity;
        return distA - distB;
      });
    } else if (sort === 'newest') {
      formattedOffers.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    // Apply pagination
    const total = formattedOffers.length;
    const paginatedOffers = formattedOffers.slice(skip, skip + limit);

    return {
      data: {
        data: paginatedOffers,
        pagination: calculatePaginationMeta(total, page, limit),
      },
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS,
    };
  }

  /**
   * Get offer details for students
   * Student only
   */
  async getOfferDetailsForStudents(
    id: string,
  ): Promise<ApiResponse<OfferDetailsResponse>> {
    const now = new Date();
    
    const offer = await this.prisma.offers.findUnique({
      where: { id },
      include: {
        offer_branches: {
          where: {
            is_active: true,
          },
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                address: true,
                city: true,
                latitude: true,
                longitude: true,
                is_active: true,
              },
            },
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    // Check if offer is active and valid
    if (
      offer.status !== 'active' ||
      offer.valid_from > now ||
      offer.valid_until < now
    ) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.OFFER.NOT_FOUND);
    }

    const formatted = this.formatOfferResponse(offer);
    
    // Format branches with full details
    const branches = offer.offer_branches.map((ob) => ({
      branchId: ob.merchant_branches.id,
      branchName: ob.merchant_branches.branch_name,
      address: ob.merchant_branches.address,
      city: ob.merchant_branches.city,
      latitude: ob.merchant_branches.latitude
        ? Number(ob.merchant_branches.latitude)
        : null,
      longitude: ob.merchant_branches.longitude
        ? Number(ob.merchant_branches.longitude)
        : null,
      isActive: ob.is_active ?? true,
    }));

    return {
      data: {
        ...formatted,
        branches,
      },
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.GET_SUCCESS,
    };
  }

  /**
   * Get offers by merchant for students
   * Student only
   */
  async getOffersByMerchantForStudents(
    merchantId: string,
  ): Promise<ApiResponse<OfferResponse[]>> {
    const now = new Date();

    // Verify merchant exists
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Get active offers for this merchant
    const offers = await this.prisma.offers.findMany({
      where: {
        merchant_id: merchantId,
        status: 'active',
        valid_from: { lte: now },
        valid_until: { gte: now },
      },
      include: {
        offer_branches: {
          where: {
            is_active: true,
          },
          include: {
            merchant_branches: {
              select: {
                id: true,
                branch_name: true,
                is_active: true,
              },
            },
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
      orderBy: {
        created_at: 'desc',
      },
    });

    const formattedOffers = offers.map((offer) =>
      this.formatOfferResponse(offer),
    );

    return {
      data: formattedOffers,
      status: 200,
      message: API_RESPONSE_MESSAGES.OFFER.LIST_SUCCESS,
    };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in kilometers
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Format offer response
   */
  private formatOfferResponse(offer: any): OfferResponse {
    return {
      id: offer.id,
      merchantId: offer.merchant_id,
      title: offer.title,
      description: offer.description,
      imageUrl: offer.image_url,
      discountType: offer.discount_type,
      discountValue: Number(offer.discount_value),
      minOrderValue: offer.min_order_value
        ? Number(offer.min_order_value)
        : null,
      maxDiscountAmount: offer.max_discount_amount
        ? Number(offer.max_discount_amount)
        : null,
      termsConditions: offer.terms_conditions,
      validFrom: offer.valid_from,
      validUntil: offer.valid_until,
      dailyLimit: offer.daily_limit,
      totalLimit: offer.total_limit,
      currentRedemptions: offer.current_redemptions || 0,
      status: offer.status,
      createdBy: offer.created_by,
      createdAt: offer.created_at,
      updatedAt: offer.updated_at,
      branches: offer.offer_branches
        ? offer.offer_branches.map((ob: any) => ({
            branchId: ob.merchant_branches.id,
            branchName: ob.merchant_branches.branch_name,
            isActive: ob.is_active,
          }))
        : undefined,
      merchant: offer.merchants
        ? {
            id: offer.merchants.id,
            businessName: offer.merchants.business_name,
            logoPath: offer.merchants.logo_path,
            category: offer.merchants.category,
          }
        : undefined,
    };
  }
}

