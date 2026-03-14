// Trigger rebuild
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { UpdateCorporateAccountDto } from './dto/update-corporate-account.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ROLES } from '../../constants/app.constants';
import { CurrentUser } from '../../types/global.types';
import { AssignOffersDto } from './dto/assign-offers.dto';
import { UpdateBonusSettingsDto } from './dto/update-bonus-settings.dto';
import { SetFeaturedBrandsDto } from './dto/set-featured-brands.dto';
import {
  calculatePaginationMeta,
  normalizePaginationParams,
  PaginationMeta,
} from '../../utils/pagination.util';

export interface CorporateMerchantResponse {
  id: string;
  userId: string;
  businessName: string;
  businessRegistrationNumber: string | null;
  contactEmail: string;
  contactPhone: string;
  logoPath: string | null;
  category: string | null;
  verificationStatus: string | null;
  verifiedAt: Date | null;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  bannerUrl: string | null;
  termsAndConditions: string | null;
  redemptionFee: number;
}

export interface BranchResponse {
  id: string;
  merchantId: string;
  merchantName: string;
  userId: string | null;
  branchName: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  contactPhone: string | null;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface BranchAssignmentResponse {
  id: string;
  branchName: string;
  standardOfferId: string | null;
  bonusOfferId: string | null;
}

export interface BonusSettingsResponse {
  redemptionsRequired: number;
  discountType: string;
  discountValue: number;
  maxDiscountAmount: number | null;
  additionalItem: string | null;
  validityDays: number | null;
  isActive: boolean | null;
  imageUrl: string | null;
}

export interface BranchOffer {
  id: string;
  title: string;
  imageUrl: string | null;
  discountType: string;
  discountValue: number;
  formattedDiscount: string;
}

export interface BranchWithBonusSettings {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  contactPhone: string | null;
  bonusSettings: {
    redemptionsRequired: number;
    currentRedemptions?: number;
    discountDescription: string;
    isActive: boolean;
  } | null;
  offers: BranchOffer[];
}

export interface MerchantDetailsForStudentsResponse {
  id: string;
  businessName: string;
  logoPath: string | null;
  bannerUrl: string | null;
  category: string | null;
  termsAndConditions: string | null;
  branches: BranchWithBonusSettings[];
}

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) { }
  private readonly logger = new Logger(MerchantsService.name);

  /**
   * Get all corporate merchants
   * Returns merchants where the associated user has role 'merchant_corporate'
   * Supports optional search parameter to filter by business name, email, or phone
   * If currentUser is a corporate merchant, returns only their own account
   * If currentUser is admin, returns all corporate merchants
   */
  async getAllCorporateMerchants(
    currentUser?: CurrentUser,
    search?: string,
  ): Promise<CorporateMerchantResponse[]> {
    const whereClause: Prisma.merchantsWhereInput = {
      users: {
        role: 'merchant_corporate',
      },
    };

    // If user is a corporate merchant, only return their own account
    if (currentUser?.role === ROLES.MERCHANT_CORPORATE) {
      whereClause.user_id = currentUser.id;
    }

    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.trim();
      whereClause.OR = [
        { business_name: { contains: searchTerm, mode: 'insensitive' } },
        { contact_email: { contains: searchTerm, mode: 'insensitive' } },
        { contact_phone: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const merchants = await this.prisma.merchants.findMany({
      where: whereClause,
      orderBy: {
        created_at: 'desc',
      },
    });

    const formattedMerchants: CorporateMerchantResponse[] = merchants.map(
      (merchant) => ({
        id: merchant.id,
        userId: merchant.user_id,
        businessName: merchant.business_name,
        businessRegistrationNumber: merchant.business_registration_number,
        contactEmail: merchant.contact_email,
        contactPhone: merchant.contact_phone,
        logoPath: merchant.logo_path,
        category: merchant.category,
        verificationStatus: merchant.verification_status || 'pending',
        verifiedAt: merchant.verified_at,
        isActive: merchant.is_active,
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at,
        bannerUrl: merchant.banner_url,
        termsAndConditions: merchant.terms_and_conditions,
        redemptionFee: Number(merchant.redemption_fee),
      }),
    );

    return formattedMerchants;
  }

  /**
   * Get all active brands (corporate merchants)
   * Accessible by students
   * Featured brands (with featured_order 1-6) are shown first, then others alphabetically
   */
  async getAllBrands(): Promise<Partial<CorporateMerchantResponse>[]> {
    const brands = await this.prisma.merchants.findMany({
      where: {
        verification_status: 'approved',
        is_active: true,
        business_name: {
          not: 'Test Merchant',
        },
        users: {
          role: 'merchant_corporate',
        },
      },
      select: {
        id: true,
        business_name: true,
        logo_path: true,
        category: true,
        featured_order: true,
      },
    });

    // Sort: featured brands first (by featured_order 1-6), then others alphabetically
    brands.sort((a, b) => {
      // If both have featured_order, sort by featured_order
      if (a.featured_order !== null && b.featured_order !== null) {
        return a.featured_order - b.featured_order;
      }
      // If only a has featured_order, a comes first
      if (a.featured_order !== null) {
        return -1;
      }
      // If only b has featured_order, b comes first
      if (b.featured_order !== null) {
        return 1;
      }
      // Neither has featured_order, sort alphabetically
      return a.business_name.localeCompare(b.business_name);
    });

    const formattedBrands = brands.map((brand) => ({
      id: brand.id,
      businessName: brand.business_name,
      logoPath: brand.logo_path,
      category: brand.category,
      featuredOrder: brand.featured_order,
    }));

    return formattedBrands;
  }

  /**
   * Get all merchants for students
   * Returns a paginated list of merchants sorted by total redemptions for a specific month
   */
  async getAllMerchantsForStudents(
    page: number = 1,
    limit: number = 10,
    month?: string,
  ): Promise<{ items: any[]; pagination: PaginationMeta }> {
    const { page: normalizedPage, limit: normalizedLimit } =
      normalizePaginationParams(page, limit);

    // Determine date range for redemption calculation
    let targetDate = new Date();
    if (month) {
      // Assuming month is passed as YYYY-MM or YYYY-MM-DD
      const parsedDate = new Date(month);
      if (!isNaN(parsedDate.getTime())) {
        targetDate = parsedDate;
      }
    }

    // Start of month
    const startDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      1,
    );
    // End of month
    const endDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const merchants = await this.prisma.merchants.findMany({
      where: {
        verification_status: 'approved',
        is_active: true,
        business_name: {
          not: 'Test Merchant',
        },
        users: {
          role: 'merchant_corporate',
        },
      },
      select: {
        id: true,
        business_name: true,
        banner_url: true,
        category: true,
        offers: {
          select: {
            _count: {
              select: {
                redemptions: {
                  where: {
                    created_at: {
                      gte: startDate,
                      lte: endDate,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Calculate total redemptions for the period and sort
    const merchantsWithRedemptions = merchants.map((merchant) => {
      const totalRedemptions = merchant.offers.reduce(
        (sum, offer) => sum + (offer._count.redemptions || 0),
        0,
      );
      return {
        id: merchant.id,
        businessName: merchant.business_name,
        bannerUrl: merchant.banner_url,
        category: merchant.category,
        totalRedemptions,
      };
    });

    // Sort by total redemptions (descending)
    merchantsWithRedemptions.sort(
      (a, b) => b.totalRedemptions - a.totalRedemptions,
    );

    // Manual Pagination
    const totalItems = merchantsWithRedemptions.length;
    const startIndex = (normalizedPage - 1) * normalizedLimit;
    const endIndex = Math.min(startIndex + normalizedLimit, totalItems);

    const paginatedItems = merchantsWithRedemptions.slice(startIndex, endIndex);

    const pagination = calculatePaginationMeta(
      totalItems,
      normalizedPage,
      normalizedLimit,
    );

    return {
      items: paginatedItems,
      pagination,
    };
  }

  /**
   * Get corporate account by ID
   * Admin only
   */
  async getCorporateAccountById(
    id: string,
  ): Promise<CorporateMerchantResponse> {
    const merchant = await this.prisma.merchants.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Verify it's a corporate account
    if (merchant.users.role !== ROLES.MERCHANT_CORPORATE) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    const formattedMerchant: CorporateMerchantResponse = {
      id: merchant.id,
      userId: merchant.user_id,
      businessName: merchant.business_name,
      businessRegistrationNumber: merchant.business_registration_number,
      contactEmail: merchant.contact_email,
      contactPhone: merchant.contact_phone,
      logoPath: merchant.logo_path,
      category: merchant.category,
      verificationStatus: merchant.verification_status || 'pending',
      verifiedAt: merchant.verified_at,
      isActive: merchant.is_active,
      createdAt: merchant.created_at,
      updatedAt: merchant.updated_at,
      bannerUrl: merchant.banner_url,
      termsAndConditions: merchant.terms_and_conditions,
      redemptionFee: Number(merchant.redemption_fee),
    };

    return formattedMerchant;
  }

  /**
   * Update corporate account
   * Admin: can update any corporate account
   * Corporate: can only update their own account (and cannot update isActive or verificationStatus)
   */
  async updateCorporateAccount(
    id: string,
    updateDto: UpdateCorporateAccountDto,
    currentUser: CurrentUser,
  ): Promise<CorporateMerchantResponse> {
    // Check if corporate account exists
    const merchant = await this.prisma.merchants.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Verify it's a corporate account
    if (merchant.users.role !== ROLES.MERCHANT_CORPORATE) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Authorization check: merchants can only update their own account
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant_id || currentUser.merchant_id !== id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      // Merchants cannot update isActive or verificationStatus (admin-only fields)
      if (
        updateDto.isActive !== undefined ||
        updateDto.verificationStatus !== undefined
      ) {
        throw new ForbiddenException(
          'You do not have permission to update this field',
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (updateDto.businessName !== undefined) {
      updateData.business_name = updateDto.businessName;
    }
    if (updateDto.businessRegistrationNumber !== undefined) {
      updateData.business_registration_number =
        updateDto.businessRegistrationNumber;
    }
    if (updateDto.contactEmail !== undefined) {
      updateData.contact_email = updateDto.contactEmail;
    }
    if (updateDto.contactPhone !== undefined) {
      updateData.contact_phone = updateDto.contactPhone;
    }
    if (updateDto.logoPath !== undefined) {
      updateData.logo_path = updateDto.logoPath;
    }
    if (updateDto.category !== undefined) {
      updateData.category = updateDto.category;
    }
    if (updateDto.bannerUrl !== undefined) {
      updateData.banner_url = updateDto.bannerUrl;
    }
    if (updateDto.termsAndConditions !== undefined) {
      updateData.terms_and_conditions = updateDto.termsAndConditions;
    }
    if (updateDto.redemptionFee !== undefined) {
      updateData.redemption_fee = updateDto.redemptionFee;
    }

    // Update verification_status if provided (admin only)
    if (updateDto.verificationStatus !== undefined) {
      updateData.verification_status = updateDto.verificationStatus;
      if (updateDto.verificationStatus === 'approved') {
        updateData.verified_at = new Date();
      }
    }

    // Update merchant is_active if provided
    if (updateDto.isActive !== undefined) {
      updateData.is_active = updateDto.isActive;
    }

    // Update merchant
    const updatedMerchant = await this.prisma.merchants.update({
      where: { id },
      data: updateData,
      include: {
        users: true,
      },
    });

    // Update user is_active if provided (keep in sync with merchant is_active)
    if (updateDto.isActive !== undefined) {
      await this.prisma.public_users.update({
        where: { id: merchant.user_id },
        data: { is_active: updateDto.isActive },
      });

      // Cascade: If corporate account is deactivated, deactivate all its branches
      // If corporate account is activated, branches remain as they are (individually managed)
      if (updateDto.isActive === false) {
        // Get all branches for this corporate account
        const branches = await this.prisma.merchant_branches.findMany({
          where: { merchant_id: id },
          select: { id: true, user_id: true },
        });

        // Deactivate all branches and their users
        if (branches.length > 0) {
          await this.prisma.$transaction(async (tx) => {
            // Update all branches to inactive
            await tx.merchant_branches.updateMany({
              where: { merchant_id: id },
              data: { is_active: false },
            });

            // Update all branch users to inactive
            const branchUserIds = branches
              .map((b) => b.user_id)
              .filter((id) => id !== null);
            if (branchUserIds.length > 0) {
              await tx.public_users.updateMany({
                where: { id: { in: branchUserIds } },
                data: { is_active: false },
              });
            }
          });
        }
      }
    }

    const formattedMerchant: CorporateMerchantResponse = {
      id: updatedMerchant.id,
      userId: updatedMerchant.user_id,
      businessName: updatedMerchant.business_name,
      businessRegistrationNumber: updatedMerchant.business_registration_number,
      contactEmail: updatedMerchant.contact_email,
      contactPhone: updatedMerchant.contact_phone,
      logoPath: updatedMerchant.logo_path,
      category: updatedMerchant.category,
      verificationStatus: updatedMerchant.verification_status || 'pending',
      verifiedAt: updatedMerchant.verified_at,
      isActive:
        updateDto.isActive !== undefined
          ? updateDto.isActive
          : updatedMerchant.is_active,
      createdAt: updatedMerchant.created_at,
      updatedAt: updatedMerchant.updated_at,
      bannerUrl: updatedMerchant.banner_url,
      termsAndConditions: updatedMerchant.terms_and_conditions,
      redemptionFee: Number(updatedMerchant.redemption_fee),
    };

    return formattedMerchant;
  }

  /**
   * Toggle corporate account status (active/inactive)
   * Admin only
   * When deactivating, cascades deactivation to all branches
   */
  async toggleCorporateAccountStatus(
    id: string,
  ): Promise<CorporateMerchantResponse> {
    // Check if corporate account exists
    const merchant = await this.prisma.merchants.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Verify it's a corporate account
    if (merchant.users.role !== ROLES.MERCHANT_CORPORATE) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Toggle isActive status
    const newIsActive = !(merchant.is_active ?? true);

    // Update merchant and user is_active status
    await this.prisma.$transaction(async (tx) => {
      // Update merchant is_active
      await tx.merchants.update({
        where: { id },
        data: { is_active: newIsActive },
      });

      // Update user is_active
      await tx.public_users.update({
        where: { id: merchant.user_id },
        data: { is_active: newIsActive },
      });

      // Cascade: If corporate account is deactivated, deactivate all its branches
      // If corporate account is activated, branches remain as they are (individually managed)
      if (newIsActive === false) {
        // Get all branches for this corporate account
        const branches = await tx.merchant_branches.findMany({
          where: { merchant_id: id },
          select: { id: true, user_id: true },
        });

        // Deactivate all branches and their users
        if (branches.length > 0) {
          // Update all branches to inactive
          await tx.merchant_branches.updateMany({
            where: { merchant_id: id },
            data: { is_active: false },
          });

          // Update all branch users to inactive
          const branchUserIds = branches
            .map((b) => b.user_id)
            .filter((userId) => userId !== null);
          if (branchUserIds.length > 0) {
            await tx.public_users.updateMany({
              where: { id: { in: branchUserIds } },
              data: { is_active: false },
            });
          }
        }
      }
    });

    // Fetch updated merchant
    const updatedMerchant = await this.prisma.merchants.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!updatedMerchant) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    const formattedMerchant: CorporateMerchantResponse = {
      id: updatedMerchant.id,
      userId: updatedMerchant.user_id,
      businessName: updatedMerchant.business_name,
      businessRegistrationNumber: updatedMerchant.business_registration_number,
      contactEmail: updatedMerchant.contact_email,
      contactPhone: updatedMerchant.contact_phone,
      logoPath: updatedMerchant.logo_path,
      category: updatedMerchant.category,
      verificationStatus: updatedMerchant.verification_status || 'pending',
      verifiedAt: updatedMerchant.verified_at,
      isActive: updatedMerchant.is_active,
      createdAt: updatedMerchant.created_at,
      updatedAt: updatedMerchant.updated_at,
      bannerUrl: updatedMerchant.banner_url,
      termsAndConditions: updatedMerchant.terms_and_conditions,
      redemptionFee: Number(updatedMerchant.redemption_fee),
    };

    return formattedMerchant;
  }

  /**
   * Delete corporate account
   * Admin only
   * This will cascade delete related branches and other related records
   */
  async deleteCorporateAccount(id: string): Promise<null> {
    // Check if corporate account exists
    const merchant = await this.prisma.merchants.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Verify it's a corporate account
    if (merchant.users.role !== ROLES.MERCHANT_CORPORATE) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Delete will cascade to branches and other related records
    await this.prisma.merchants.delete({
      where: { id },
    });

    return null;
  }

  /**
   * Get branches
   * Admin: can view all branches
   * Corporate: can only view their own branches
   * Only shows branches of active corporate accounts
   * Supports optional search parameter to filter by branch name, merchant name, or city
   */
  async getBranches(
    currentUser: CurrentUser,
    corporateAccountId?: string,
    search?: string,
  ): Promise<BranchResponse[]> {
    const whereClause: Prisma.merchant_branchesWhereInput = {
      merchants: {
        is_active: true, // Only show branches of active corporate accounts
      },
    };

    // If corporate account, filter by their merchant_id
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant_id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      whereClause.merchant_id = currentUser.merchant_id;
    } else if (currentUser.role === ROLES.ADMIN) {
      // Admin can filter by corporateAccountId if provided
      if (corporateAccountId) {
        whereClause.merchant_id = corporateAccountId;
      }
      // Otherwise, admin sees all branches (but only from active corporate accounts)
    } else {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.trim();
      whereClause.AND = [
        {
          OR: [
            { branch_name: { contains: searchTerm, mode: 'insensitive' } },
            { city: { contains: searchTerm, mode: 'insensitive' } },
            {
              merchants: {
                business_name: { contains: searchTerm, mode: 'insensitive' },
              },
            },
          ],
        },
      ];
    }

    const branches = await this.prisma.merchant_branches.findMany({
      where: whereClause,
      include: {
        merchants: {
          select: {
            business_name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const formattedBranches: BranchResponse[] = branches.map((branch) => ({
      id: branch.id,
      merchantId: branch.merchant_id,
      merchantName: branch.merchants.business_name,
      userId: branch.user_id,
      branchName: branch.branch_name,
      address: branch.address,
      city: branch.city,
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      contactPhone: branch.contact_phone,
      isActive: branch.is_active,
      createdAt: branch.created_at,
      updatedAt: branch.updated_at,
    }));

    return formattedBranches;
  }

  /**
   * Get branch by ID
   * Admin: can view any branch
   * Corporate: can only view their own branches
   */
  async getBranchById(
    id: string,
    currentUser: CurrentUser,
  ): Promise<BranchResponse> {
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id },
      include: {
        merchants: {
          include: {
            users: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant_id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      if (branch.merchant_id !== currentUser.merchant_id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const formattedBranch: BranchResponse = {
      id: branch.id,
      merchantId: branch.merchant_id,
      merchantName: branch.merchants.business_name,
      userId: branch.user_id,
      branchName: branch.branch_name,
      address: branch.address,
      city: branch.city,
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      contactPhone: branch.contact_phone,
      isActive: branch.is_active,
      createdAt: branch.created_at,
      updatedAt: branch.updated_at,
    };

    return formattedBranch;
  }

  /**
   * Update branch
   * Admin: can update any branch
   * Corporate: can only update their own branches
   */
  async updateBranch(
    id: string,
    updateDto: UpdateBranchDto,
    currentUser: CurrentUser,
  ): Promise<BranchResponse> {
    // Check if branch exists
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id },
      include: {
        merchants: {
          include: {
            users: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    // Check if corporate account is active (branches of inactive corporate accounts should not be accessible)
    if (!branch.merchants.is_active) {
      throw new ForbiddenException(
        'Cannot access branches of an inactive corporate account',
      );
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant_id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      if (branch.merchant_id !== currentUser.merchant_id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updateDto.branchName !== undefined) {
      updateData.branch_name = updateDto.branchName;
    }
    if (updateDto.address !== undefined) {
      updateData.address = updateDto.address;
    }
    if (updateDto.city !== undefined) {
      updateData.city = updateDto.city;
    }
    if (updateDto.contactPhone !== undefined) {
      updateData.contact_phone = updateDto.contactPhone;
    }
    if (updateDto.latitude !== undefined) {
      updateData.latitude = updateDto.latitude;
    }
    if (updateDto.longitude !== undefined) {
      updateData.longitude = updateDto.longitude;
    }
    if (updateDto.isActive !== undefined) {
      updateData.is_active = updateDto.isActive;
    }

    // Update branch
    const updatedBranch = await this.prisma.merchant_branches.update({
      where: { id },
      data: updateData,
      include: {
        merchants: {
          select: {
            business_name: true,
          },
        },
      },
    });

    // Update user is_active if provided (keep in sync with branch is_active)
    if (updateDto.isActive !== undefined && branch.user_id) {
      await this.prisma.public_users.update({
        where: { id: branch.user_id },
        data: { is_active: updateDto.isActive },
      });
    }

    const formattedBranch: BranchResponse = {
      id: updatedBranch.id,
      merchantId: updatedBranch.merchant_id,
      merchantName: updatedBranch.merchants.business_name,
      userId: updatedBranch.user_id,
      branchName: updatedBranch.branch_name,
      address: updatedBranch.address,
      city: updatedBranch.city,
      latitude: updatedBranch.latitude ? Number(updatedBranch.latitude) : null,
      longitude: updatedBranch.longitude
        ? Number(updatedBranch.longitude)
        : null,
      contactPhone: updatedBranch.contact_phone,
      isActive: updatedBranch.is_active,
      createdAt: updatedBranch.created_at,
      updatedAt: updatedBranch.updated_at,
    };

    return formattedBranch;
  }

  /*
   * Create branch
   * Admin: can create branch for any merchant (must provide merchantId) -- simpler to just restrict to corporate for now or imply from context if needed, but per requirement typically Corporate creates their own.
   * Corporate: can create branch for themselves
   */
  async createBranch(
    createDto: CreateBranchDto,
    currentUser: CurrentUser,
  ): Promise<BranchResponse> {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    if (!currentUser.merchant_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant_id;

    // Check if corporate account is active (need to fetch from DB since not in JWT)
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: merchantId },
      select: { is_active: true },
    });

    if (!merchant || !merchant.is_active) {
      throw new ForbiddenException(
        'Cannot create branches for an inactive corporate account',
      );
    }

    const branch = await this.prisma.merchant_branches.create({
      data: {
        merchant_id: merchantId,
        branch_name: createDto.branchName,
        address: createDto.address,
        city: createDto.city,
        contact_phone: createDto.contactPhone,
        latitude: createDto.latitude,
        longitude: createDto.longitude,
        is_active: createDto.isActive ?? true,
      },
      include: {
        merchants: {
          select: {
            business_name: true,
          },
        },
      },
    });

    const formattedBranch: BranchResponse = {
      id: branch.id,
      merchantId: branch.merchant_id,
      merchantName: branch.merchants.business_name,
      userId: branch.user_id,
      branchName: branch.branch_name,
      address: branch.address,
      city: branch.city,
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      contactPhone: branch.contact_phone,
      isActive: branch.is_active,
      createdAt: branch.created_at,
      updatedAt: branch.updated_at,
    };

    return formattedBranch;
  }

  /**
   * Delete branch
   * Admin: can delete any branch
   * Corporate: can only delete their own branches
   */
  async deleteBranch(id: string, currentUser: CurrentUser): Promise<null> {
    // Check if branch exists
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id },
      include: {
        merchants: true,
      },
    });

    if (!branch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    // Check if corporate account is active (branches of inactive corporate accounts should not be accessible)
    if (!branch.merchants.is_active) {
      throw new ForbiddenException(
        'Cannot access branches of an inactive corporate account',
      );
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant_id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      if (branch.merchant_id !== currentUser.merchant_id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    try {
      // Delete branch (cascade will handle related records)
      await this.prisma.merchant_branches.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          // Foreign key constraint violation
          throw new BadRequestException(
            'Cannot delete this branch because it has associated records (e.g., Redemptions). Please contact support or deactivate the branch instead.',
          );
        }
      }
      throw error;
    }

    return null;
  }

  /**
   * Get branch assignments (active offers and bonus settings)
   * Corporate and Admin
   */
  async getBranchAssignments(
    currentUser: CurrentUser,
  ): Promise<BranchAssignmentResponse[]> {
    // Build where clause based on user role
    const whereClause: Prisma.merchant_branchesWhereInput = {};

    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant_id) {
        throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
      }
      whereClause.merchant_id = currentUser.merchant_id;
    } else if (currentUser.role === ROLES.ADMIN) {
      // Admin can see all branch assignments
      // No filter needed - will return all branches
    } else {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branches = await this.prisma.merchant_branches.findMany({
      where: whereClause,
      select: {
        id: true,
        branch_name: true,
        offer_branches: {
          select: {
            offer_id: true,
          },
        },
        branch_bonus_settings: {
          select: {
            redemptions_required: true,
          },
        },
      },
      orderBy: {
        branch_name: 'asc',
      },
    });

    const formatted: BranchAssignmentResponse[] = branches.map((b) => ({
      id: b.id,
      branchName: b.branch_name,
      // We return the first active offer as "standard" for backward compatibility if needed,
      // or we can change the response structure.
      // Based on previous logic, let's assume the first active offer is the standard one.
      standardOfferId:
        b.offer_branches.length > 0 ? b.offer_branches[0].offer_id : null,
      bonusOfferId: null, // Bonus is now handled via settings, not a separate offer ID
    }));

    return formatted;
  }

  /**
   * Assign offers to a branch (Manage offer_branches)
   * Corporate and Admin
   */
  async assignOffersToBranch(
    branchId: string,
    dto: AssignOffersDto,
    currentUser: CurrentUser,
  ): Promise<BranchAssignmentResponse> {
    // Verify branch exists
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (
        !currentUser.merchant_id ||
        branch.merchant_id !== currentUser.merchant_id
      ) {
        throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    // Verify offers exist and belong to merchant
    const offerIds = [dto.standardOfferId];
    // If bonusOfferId was passed, we ignore it or treat it as another active offer if intended.
    // For now, we only focus on standardOfferId as the primary active offer.

    // For admin, verify offer exists. For corporate, verify it belongs to them.
    let count: number;
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      count = await this.prisma.offers.count({
        where: {
          id: { in: offerIds },
          merchant_id: currentUser.merchant!.id, // Safe because we checked above
        },
      });
    } else {
      // Admin - just verify offer exists and belongs to same merchant as branch
      count = await this.prisma.offers.count({
        where: {
          id: { in: offerIds },
          merchant_id: branch.merchant_id,
        },
      });
    }

    if (count !== offerIds.length) {
      const message =
        currentUser.role === ROLES.ADMIN
          ? 'One or more offers not found or do not belong to this merchant'
          : 'One or more offers not found or do not belong to you';
      throw new BadRequestException(message);
    }

    // Transaction to update offer_branches
    await this.prisma.$transaction(async (tx) => {
      // Remove all existing offers for this branch (enforce one offer per branch)
      await tx.offer_branches.deleteMany({
        where: { branch_id: branchId },
      });

      // Create the selected offer assignment
      await tx.offer_branches.create({
        data: {
          offer_id: dto.standardOfferId,
          branch_id: branchId,
        },
      });
    });

    return {
      id: branch.id,
      branchName: branch.branch_name,
      standardOfferId: dto.standardOfferId,
      bonusOfferId: null,
    };
  }

  /**
   * Get bonus settings for a branch
   * Corporate and Admin
   */
  async getBranchBonusSettings(
    branchId: string,
    currentUser: CurrentUser,
  ): Promise<BonusSettingsResponse> {
    // Verify branch exists
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (
        !currentUser.merchant_id ||
        branch.merchant_id !== currentUser.merchant_id
      ) {
        throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const settings = await this.prisma.branch_bonus_settings.findUnique({
      where: { branch_id: branchId },
    });

    if (!settings) {
      // Return default if not found
      return {
        redemptionsRequired: 5,
        discountType: 'percentage',
        discountValue: 0,
        maxDiscountAmount: null,
        additionalItem: null,
        validityDays: 30,
        isActive: true,
        imageUrl: null,
      };
    }

    return {
      redemptionsRequired: settings.redemptions_required,
      discountType: settings.discount_type,
      discountValue: Number(settings.discount_value),
      maxDiscountAmount: settings.max_discount_amount
        ? Number(settings.max_discount_amount)
        : null,
      additionalItem: settings.additional_item,
      validityDays: settings.validity_days,
      isActive: settings.is_active,
      imageUrl: settings.image_url,
    };
  }

  /**
   * Update bonus settings for a branch
   * Corporate and Admin
   */
  async updateBranchBonusSettings(
    branchId: string,
    dto: UpdateBonusSettingsDto,
    currentUser: CurrentUser,
  ): Promise<BonusSettingsResponse> {
    // Verify branch exists
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (
        !currentUser.merchant_id ||
        branch.merchant_id !== currentUser.merchant_id
      ) {
        throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    // If discount type is 'item', set discount_value to 0
    const discountValue = dto.discountType === 'item' ? 0 : dto.discountValue;
    // If discount type is 'item', set max_discount_amount to null
    const maxDiscountAmount =
      dto.discountType === 'item' ? null : dto.maxDiscountAmount;

    const settings = await this.prisma.branch_bonus_settings.upsert({
      where: { branch_id: branchId },
      update: {
        redemptions_required: dto.redemptionsRequired,
        discount_type: dto.discountType,
        discount_value: discountValue,
        max_discount_amount: maxDiscountAmount,
        additional_item: dto.additionalItem,
        validity_days: dto.validityDays,
        is_active: dto.isActive,
        image_url: dto.imageUrl,
      },
      create: {
        branch_id: branchId,
        redemptions_required: dto.redemptionsRequired,
        discount_type: dto.discountType,
        discount_value: discountValue,
        max_discount_amount: maxDiscountAmount,
        additional_item: dto.additionalItem,
        validity_days: dto.validityDays,
        is_active: dto.isActive,
        image_url: dto.imageUrl,
      },
    });

    return {
      redemptionsRequired: settings.redemptions_required,
      discountType: settings.discount_type,
      discountValue: Number(settings.discount_value),
      maxDiscountAmount: settings.max_discount_amount
        ? Number(settings.max_discount_amount)
        : null,
      additionalItem: settings.additional_item,
      validityDays: settings.validity_days,
      isActive: settings.is_active,
      imageUrl: settings.image_url,
    };
  }

  /**
   * Approve or reject branch
   * Admin only
   * Updates both merchant_branches.is_active and public_users.is_active
   */
  async approveRejectBranch(
    id: string,
    action: 'approved' | 'rejected',
  ): Promise<BranchResponse> {
    // Check if branch exists
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id },
      include: {
        merchants: {
          include: {
            users: true,
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    // Verify it's a branch under a corporate account
    if (branch.merchants.users.role !== ROLES.MERCHANT_CORPORATE) {
      throw new BadRequestException(
        'This branch does not belong to a corporate account',
      );
    }

    // Set is_active based on action
    const isActive = action === 'approved';

    // Update both branch and user is_active status
    await this.prisma.$transaction(async (tx) => {
      // Update merchant_branches.is_active
      await tx.merchant_branches.update({
        where: { id },
        data: { is_active: isActive },
      });

      // Update public_users.is_active if user_id exists
      if (branch.user_id) {
        await tx.public_users.update({
          where: { id: branch.user_id },
          data: { is_active: isActive },
        });
      }
    });

    // Fetch updated branch
    const updatedBranch = await this.prisma.merchant_branches.findUnique({
      where: { id },
      include: {
        merchants: {
          select: {
            business_name: true,
          },
        },
      },
    });

    if (!updatedBranch) {
      throw new NotFoundException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND,
      );
    }

    const formattedBranch: BranchResponse = {
      id: updatedBranch.id,
      merchantId: updatedBranch.merchant_id,
      merchantName: updatedBranch.merchants.business_name,
      userId: updatedBranch.user_id,
      branchName: updatedBranch.branch_name,
      address: updatedBranch.address,
      city: updatedBranch.city,
      latitude: updatedBranch.latitude ? Number(updatedBranch.latitude) : null,
      longitude: updatedBranch.longitude
        ? Number(updatedBranch.longitude)
        : null,
      contactPhone: updatedBranch.contact_phone,
      isActive: updatedBranch.is_active,
      createdAt: updatedBranch.created_at,
      updatedAt: updatedBranch.updated_at,
    };

    return formattedBranch;
  }

  async getRedemptionReport(
    currentUser: CurrentUser,
    startDate: Date,
    endDate: Date,
  ) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE || !currentUser.merchant_id) {
      throw new ForbiddenException('Only corporate merchants can access reports');
    }

    // Get merchant details including redemption fee
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: currentUser.merchant_id },
      select: {
        business_name: true,
        redemption_fee: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    // Get all branches for this merchant
    const branches = await this.prisma.merchant_branches.findMany({
      where: { merchant_id: currentUser.merchant_id },
      select: { id: true },
    });

    const branchIds = branches.map((b) => b.id);

    // Fetch redemptions
    const redemptions = await this.prisma.redemptions.findMany({
      where: {
        branch_id: { in: branchIds },
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        merchant_branches: {
          select: { branch_name: true },
        },
        offers: {
          select: { title: true },
        },
        students: {
          select: {
            university: true,
            users: {
              select: {
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Calculate branch breakdown
    const branchBreakdownMap = new Map<string, { name: string; count: number }>();
    
    redemptions.forEach(r => {
      const branchName = r.merchant_branches.branch_name;
      if (!branchBreakdownMap.has(branchName)) {
        branchBreakdownMap.set(branchName, { name: branchName, count: 0 });
      }
      const entry = branchBreakdownMap.get(branchName)!;
      entry.count++;
    });

    const branchBreakdown = Array.from(branchBreakdownMap.values()).map(b => ({
      branchName: b.name,
      totalRedemptions: b.count,
      totalPayable: b.count * Number(merchant.redemption_fee)
    }));

    return {
      merchantDetails: {
        businessName: merchant.business_name,
        redemptionFee: Number(merchant.redemption_fee),
      },
      branchBreakdown,
      redemptions: redemptions.map(r => ({
        id: r.id,
        date: r.created_at,
        branchName: r.merchant_branches.branch_name,
        offerTitle: r.offers.title,
        studentInfo: r.students?.users?.email || 'Unknown',
        university: r.students?.university,
        discountApplied: Number(r.bonus_discount_applied || 0),
      })),
      summary: {
        totalRedemptions: redemptions.length,
        totalPayable: redemptions.length * Number(merchant.redemption_fee),
      }
    };
  }

  /**
   * Get corporate dashboard stats (Overview cards)
   * Corporate only
   */
  async getDashboardStats(
    currentUser: CurrentUser,
    startDate?: Date,
    endDate?: Date,
  ) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant_id;

    // 1. Get all branches for this merchant
    const branches = await this.prisma.merchant_branches.findMany({
      where: { merchant_id: merchantId },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    if (branchIds.length === 0) {
      return {
        totalRedemptions: 0,
        totalDiscountGiven: 0,
        avgDiscountPerOrder: 0,
        uniqueStudents: 0,
      };
    }

    // 2. Aggregate Redemptions
    const redemptions = await this.prisma.redemptions.findMany({
      where: {
        branch_id: { in: branchIds },
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        offers: {
          select: {
            discount_value: true,
          },
        },
      },
    });

    const totalRedemptions = redemptions.length;
    let totalDiscountGiven = 0;
    const uniqueStudentIds = new Set<string>();

    redemptions.forEach((r) => {
      // Calculate total discount (offer base + bonus)
      const offerDiscount = Number(r.offers.discount_value);
      const bonusDiscount = r.bonus_discount_applied
        ? Number(r.bonus_discount_applied)
        : 0;
      totalDiscountGiven += offerDiscount + bonusDiscount;

      uniqueStudentIds.add(r.student_id);
    });

    const avgDiscountPerOrder =
      totalRedemptions > 0 ? totalDiscountGiven / totalRedemptions : 0;

    return {
      totalRedemptions,
      totalDiscountGiven,
      avgDiscountPerOrder: Math.round(avgDiscountPerOrder), // Round to nearest integer
      uniqueStudents: uniqueStudentIds.size,
    };
  }

  /**
   * Get dashboard analytics (Line chart - Time of Day)
   * Corporate only
   */

  async getDashboardAnalytics(
    currentUser: CurrentUser,
    startDate?: Date,
    endDate?: Date,
  ) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant_id;

    // Get all branches
    const branches = await this.prisma.merchant_branches.findMany({
      where: { merchant_id: merchantId },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    if (branchIds.length === 0) {
      return [];
    }

    // Default to last 30 days if no dates provided
    let effectiveStartDate = startDate;
    if (!effectiveStartDate) {
      effectiveStartDate = new Date();
      effectiveStartDate.setDate(effectiveStartDate.getDate() - 30);
      effectiveStartDate.setHours(0, 0, 0, 0);
    }

    const redemptions = await this.prisma.redemptions.findMany({
      where: {
        branch_id: { in: branchIds },
        created_at: {
          gte: effectiveStartDate,
          lte: endDate,
        },
      },
      select: {
        created_at: true,
      },
    });

    // Group by hour (00:00, 01:00, ... 23:00)
    const hourlyData = new Array(24).fill(0);

    redemptions.forEach((r) => {
      if (r.created_at) {
        const hour = new Date(r.created_at).getHours();
        hourlyData[hour]++;
      }
    });

    // Format for chart with standard keys: name (label), value (number)
    const chartData = hourlyData.map((count, hour) => ({
      time: `${hour.toString().padStart(2, '0')}:00`,
      name: `${hour.toString().padStart(2, '0')}:00`, // Standard chart key
      redemptions: count,
      value: count, // Standard chart key
    }));

    return chartData;
  }

  /**
   * Get branch performance (Bar chart & Pie chart)
   * Corporate only
   */
  async getBranchPerformance(
    currentUser: CurrentUser,
    startDate?: Date,
    endDate?: Date,
  ) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant_id;

    // Get branches and count redemptions individually to be accurate
    // Filter by active merchant accounts similar to getBranches
    const branches = await this.prisma.merchant_branches.findMany({
      where: {
        merchant_id: merchantId,
        is_active: true, // Only show active branches
        merchants: { is_active: true }, // Consistency with getBranches
      },
      include: {
        _count: {
          select: {
            redemptions: {
              where: {
                created_at: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            },
          },
        },
      },
    });

    this.logger.log(
      `Branch Performance - Merchant: ${merchantId}, Found ${branches.length} branches`,
    );

    // Sort by redemptions desc
    // Format with standard chart keys for maximum compatibility
    const performanceData = branches.map((b) => ({
      branchId: b.id,
      branchName: b.branch_name,
      name: b.branch_name, // Standard chart key (for labels)
      redemptionCount: b._count.redemptions,
      redemptions: b._count.redemptions,
      value: b._count.redemptions, // Standard chart key (for values)
    }));

    // Sort by redemptions desc
    performanceData.sort((a, b) => b.value - a.value);

    return performanceData;
  }

  /**
   * Get offer performance (Top/Least performing)
   * Corporate only
   */
  async getOfferPerformance(
    currentUser: CurrentUser,
    startDate?: Date,
    endDate?: Date,
  ) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant_id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant_id;

    // Get offers for this merchant with dynamic redemption count
    const offers = await this.prisma.offers.findMany({
      where: { merchant_id: merchantId },
      select: {
        id: true,
        title: true,
        discount_value: true,
        discount_type: true,
        status: true,
        redemption_strategy: true,
        _count: {
          select: {
            redemptions: {
              where: {
                created_at: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            },
          },
        },
        current_redemptions: true, // Keep for fallback or total
      },
    });

    const formattedOffers = offers.map((o) => ({
      id: o.id,
      title: o.title,
      discount:
        o.discount_type === 'percentage'
          ? `${o.discount_value}% OFF`
          : `Rs.${o.discount_value} OFF`,
      status: o.status,
      // Use dynamic count from _count if dates are used, otherwise we can still use _count which works for all time too
      // if no dates provided, _count.redemptions will be total.
      currentRedemptions: o._count.redemptions,
    }));

    // Sort by redemptions desc
    formattedOffers.sort((a, b) => b.currentRedemptions - a.currentRedemptions);

    return formattedOffers;
  }

  /**
   * Get merchant details for students
   * Includes branches with bonus settings
   * Student only
   * OPTIMIZED: Uses parallel queries to reduce response time
   */
  async getMerchantDetailsForStudents(
    merchantId: string,
    userId?: string,
  ): Promise<MerchantDetailsForStudentsResponse> {
    // ── Single round-trip: one SQL query replaces 3 separate Prisma round-trips ─
    //
    // Previously this method made 2–3 network round-trips to the database
    // (merchant+branches, offers, student stats). Each round-trip over the
    // internet to Supabase costs ~300–600 ms, so 3 × 400 ms ≈ 1.2–2 s total.
    //
    // This raw query fetches everything in one go:
    //   • merchant + role validation
    //   • active branches + bonus settings (LEFT JOIN)
    //   • active/valid offers with their branch assignments (LEFT JOIN + JSON_AGG)
    //   • student redemption stats for this student × these branches (LEFT JOIN)
    //
    // All joins are on indexed foreign keys, so Postgres cost is unchanged.
    // The only saving is eliminating 2 extra network hops.
    const now = new Date();

    // Resolve student UUID once (cheap indexed lookup on idx_students_user)
    // Only needed if a userId was supplied.
    let studentId: string | null = null;
    if (userId) {
      const studentRow = await this.prisma.students.findUnique({
        where: { user_id: userId },
        select: { id: true },
      });
      studentId = studentRow?.id ?? null;
    }

    type RawRow = {
      m_id: string;
      m_business_name: string;
      m_logo_path: string | null;
      m_banner_url: string | null;
      m_category: string | null;
      m_terms: string | null;
      m_verification_status: string | null;
      m_is_active: boolean | null;
      m_user_role: string;
      b_id: string | null;
      b_branch_name: string | null;
      b_address: string | null;
      b_city: string | null;
      b_latitude: string | null;
      b_longitude: string | null;
      b_contact_phone: string | null;
      bbs_redemptions_required: number | null;
      bbs_discount_type: string | null;
      bbs_discount_value: string | null;
      bbs_additional_item: string | null;
      bbs_is_active: boolean | null;
      sbs_redemption_count: number | null;
      offers_json: string | null; // JSON array of offers for this branch
    };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        -- Merchant
        m.id                        AS m_id,
        m.business_name             AS m_business_name,
        m.logo_path                 AS m_logo_path,
        m.banner_url                AS m_banner_url,
        m.category                  AS m_category,
        m.terms_and_conditions      AS m_terms,
        m.verification_status::text AS m_verification_status,
        m.is_active                 AS m_is_active,
        u.role::text                AS m_user_role,

        -- Branch
        b.id                        AS b_id,
        b.branch_name               AS b_branch_name,
        b.address                   AS b_address,
        b.city                      AS b_city,
        b.latitude::text            AS b_latitude,
        b.longitude::text           AS b_longitude,
        b.contact_phone             AS b_contact_phone,

        -- Bonus settings
        bbs.redemptions_required    AS bbs_redemptions_required,
        bbs.discount_type           AS bbs_discount_type,
        bbs.discount_value::text    AS bbs_discount_value,
        bbs.additional_item         AS bbs_additional_item,
        bbs.is_active               AS bbs_is_active,

        -- Student stats for this branch (NULL if no userId)
        sbs.redemption_count        AS sbs_redemption_count,

        -- Offers assigned to this branch (aggregated as JSON)
        (
          SELECT json_agg(
            json_build_object(
              'id',                  o.id,
              'title',               o.title,
              'imageUrl',            o.image_url,
              'discountType',        o.discount_type,
              'discountValue',       o.discount_value::text,
              'additionalItem',      o.additional_item,
              'redemptionStrategy',  o.redemption_strategy
            )
            ORDER BY o.created_at DESC
          )
          FROM public.offer_branches ob2
          JOIN public.offers o
            ON o.id = ob2.offer_id
           AND o.merchant_id    = ${merchantId}::uuid
           AND o.status         = 'active'
           AND o.valid_from    <= ${now}
           AND o.valid_until   >= ${now}
          WHERE ob2.branch_id = b.id
        )                           AS offers_json

      FROM public.merchants m
      JOIN public.users u
        ON u.id = m.user_id

      LEFT JOIN public.merchant_branches b
        ON b.merchant_id = m.id
       AND b.is_active = true

      LEFT JOIN public.branch_bonus_settings bbs
        ON bbs.branch_id = b.id

      LEFT JOIN public.student_branch_stats sbs
        ON sbs.branch_id  = b.id
       AND sbs.student_id = ${studentId ? studentId : null}::uuid

      WHERE m.id = ${merchantId}::uuid

      ORDER BY b.branch_name ASC
    `;

    if (!rows.length) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    const first = rows[0];

    // Validate merchant
    if (first.m_user_role !== ROLES.MERCHANT_CORPORATE) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }
    if (first.m_verification_status !== 'approved' || !first.m_is_active) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // ── Assemble response in-memory (no extra DB calls) ───────────────────
    const formattedBranches: BranchWithBonusSettings[] = rows
      .filter((r) => r.b_id !== null)
      .map((r) => {
        const currentStats = r.sbs_redemption_count ?? 0;

        // Parse offers JSON aggregated by Postgres
        type RawOffer = {
          id: string;
          title: string;
          imageUrl: string | null;
          discountType: string;
          discountValue: string;
          additionalItem: string | null;
          redemptionStrategy: string | null;
        };
        const rawOffers: RawOffer[] =
          r.offers_json
            ? (typeof r.offers_json === 'string'
                ? JSON.parse(r.offers_json)
                : r.offers_json) as RawOffer[]
            : [];

        const offers: BranchOffer[] = rawOffers.map((o) => {
          let formattedDiscount: string;
          if (o.discountType === 'percentage') {
            formattedDiscount = `${Number(o.discountValue)}% OFF`;
          } else if (o.additionalItem && o.additionalItem.trim() !== '') {
            formattedDiscount = o.additionalItem;
          } else {
            formattedDiscount = `Rs. ${Number(o.discountValue)} OFF`;
          }
          return {
            id: o.id,
            title: o.title,
            imageUrl: o.imageUrl,
            discountType: o.discountType,
            discountValue: Number(o.discountValue),
            formattedDiscount,
          };
        });

        // Bonus settings
        let bonusSettings: BranchWithBonusSettings['bonusSettings'] = null;
        if (r.bbs_discount_type !== null) {
          let discountDescription: string;
          if (r.bbs_discount_type === 'percentage') {
            discountDescription = `${r.bbs_discount_value}% OFF`;
          } else if (r.bbs_discount_type === 'fixed') {
            discountDescription = `Rs.${r.bbs_discount_value} OFF`;
          } else if (r.bbs_additional_item) {
            discountDescription = r.bbs_additional_item;
          } else {
            discountDescription = 'Bonus Reward';
          }
          bonusSettings = {
            redemptionsRequired: r.bbs_redemptions_required ?? 5,
            currentRedemptions: currentStats,
            discountDescription,
            isActive: r.bbs_is_active ?? true,
          };
        }

        // Soho hierarchical strategy fallback
        if (!bonusSettings) {
          const hasSoho = rawOffers.some(
            (o) => o.redemptionStrategy === 'soho_hierarchical',
          );
          if (hasSoho) {
            const count = currentStats;
            let target: number;
            let description: string;
            if (count < 2) {
              target = 2; description = '30% OFF';
            } else if (count === 2) {
              target = 3; description = '40% OFF';
            } else {
              target = count + 1; description = '40% OFF (Streak)';
            }
            bonusSettings = {
              redemptionsRequired: target,
              currentRedemptions: count,
              discountDescription: description,
              isActive: true,
            };
          }
        }

        return {
          id: r.b_id!,
          name: r.b_branch_name!,
          address: r.b_address!,
          city: r.b_city!,
          latitude: r.b_latitude ? Number(r.b_latitude) : null,
          longitude: r.b_longitude ? Number(r.b_longitude) : null,
          contactPhone: r.b_contact_phone,
          bonusSettings,
          offers,
        };
      });

    return {
      id: first.m_id,
      businessName: first.m_business_name,
      logoPath: first.m_logo_path,
      bannerUrl: first.m_banner_url,
      category: first.m_category,
      termsAndConditions: first.m_terms,
      branches: formattedBranches,
    };
  }

  /**
   * Set featured brands (top 6 brands)
   * Admin only
   * Sets featured_order (1-6) for specified brands and clears it for others
   */
  async setFeaturedBrands(
    dto: SetFeaturedBrandsDto,
  ): Promise<{ message: string }> {
    // Validate that all brand IDs exist and are corporate merchants
    const brandIds = dto.brands.map((b) => b.brandId);
    const existingBrands = await this.prisma.merchants.findMany({
      where: {
        id: { in: brandIds },
        users: {
          role: 'merchant_corporate',
        },
      },
      select: { id: true },
    });

    if (existingBrands.length !== brandIds.length) {
      throw new NotFoundException('One or more brands not found');
    }

    // Validate that orders are unique and within 1-6 range
    const orders = dto.brands.map((b) => b.order);
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      throw new BadRequestException('Featured orders must be unique (1-6)');
    }

    // Use transaction to update all brands
    await this.prisma.$transaction(async (tx) => {
      // First, clear all existing featured orders
      await tx.merchants.updateMany({
        where: {
          featured_order: { not: null },
        },
        data: {
          featured_order: null,
        },
      });

      // Then, set the new featured orders
      for (const brand of dto.brands) {
        await tx.merchants.update({
          where: { id: brand.brandId },
          data: { featured_order: brand.order },
        });
      }
    });

    return { message: 'Featured brands updated successfully' };
  }
}
