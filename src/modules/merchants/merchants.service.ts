// Trigger rebuild
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { UpdateCorporateAccountDto } from './dto/update-corporate-account.dto';
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
            redemptions: {
              where: {
                created_at: {
                  gte: startDate,
                  lte: endDate,
                },
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    // Calculate total redemptions for the period and sort
    const merchantsWithRedemptions = merchants.map((merchant) => {
      const totalRedemptions = merchant.offers.reduce(
        (sum, offer) => sum + (offer.redemptions?.length || 0),
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
      if (!currentUser.merchant?.id || currentUser.merchant.id !== id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      // Merchants cannot update isActive or verificationStatus (admin-only fields)
      if (updateDto.isActive !== undefined || updateDto.verificationStatus !== undefined) {
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
      updateData.business_registration_number = updateDto.businessRegistrationNumber;
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
              .filter((id) => id !== null) as string[];
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
            .filter((userId) => userId !== null) as string[];
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
    let whereClause: Prisma.merchant_branchesWhereInput = {
      merchants: {
        is_active: true, // Only show branches of active corporate accounts
      },
    };

    // If corporate account, filter by their merchant_id
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      whereClause.merchant_id = currentUser.merchant.id;
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
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      if (branch.merchant_id !== currentUser.merchant.id) {
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
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      if (branch.merchant_id !== currentUser.merchant.id) {
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
      longitude: updatedBranch.longitude ? Number(updatedBranch.longitude) : null,
      contactPhone: updatedBranch.contact_phone,
      isActive: updatedBranch.is_active,
      createdAt: updatedBranch.created_at,
      updatedAt: updatedBranch.updated_at,
    };

    return formattedBranch;
  }

  /**
   * Delete branch
   * Admin: can delete any branch
   * Corporate: can only delete their own branches
   */
  async deleteBranch(
    id: string,
    currentUser: CurrentUser,
  ): Promise<null> {
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
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
      if (branch.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(
          API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
        );
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    // Delete branch (cascade will handle related records)
    await this.prisma.merchant_branches.delete({
      where: { id },
    });

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
    let whereClause: Prisma.merchant_branchesWhereInput = {};

    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id) {
        throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
      }
      whereClause.merchant_id = currentUser.merchant.id;
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
          where: { is_active: true },
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
      standardOfferId: b.offer_branches.length > 0 ? b.offer_branches[0].offer_id : null,
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id || branch.merchant_id !== currentUser.merchant.id) {
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
      const message = currentUser.role === ROLES.ADMIN
        ? 'One or more offers not found or do not belong to this merchant'
        : 'One or more offers not found or do not belong to you';
      throw new BadRequestException(message);
    }

    // Transaction to update offer_branches
    await this.prisma.$transaction(async (tx) => {
      // Deactivate all existing offers for this branch
      await tx.offer_branches.updateMany({
        where: { branch_id: branchId },
        data: { is_active: false },
      });

      // Activate/Create the selected offer
      const existingLink = await tx.offer_branches.findUnique({
        where: {
          offer_id_branch_id: {
            offer_id: dto.standardOfferId,
            branch_id: branchId,
          },
        },
      });

      if (existingLink) {
        await tx.offer_branches.update({
          where: { id: existingLink.id },
          data: { is_active: true },
        });
      } else {
        await tx.offer_branches.create({
          data: {
            offer_id: dto.standardOfferId,
            branch_id: branchId,
            is_active: true,
          },
        });
      }
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id || branch.merchant_id !== currentUser.merchant.id) {
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
      maxDiscountAmount: settings.max_discount_amount ? Number(settings.max_discount_amount) : null,
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
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND);
    }

    // Authorization check
    if (currentUser.role === ROLES.MERCHANT_CORPORATE) {
      if (!currentUser.merchant?.id || branch.merchant_id !== currentUser.merchant.id) {
        throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
      }
    } else if (currentUser.role !== ROLES.ADMIN) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    // If discount type is 'item', set discount_value to 0
    const discountValue = dto.discountType === 'item' ? 0 : dto.discountValue;
    // If discount type is 'item', set max_discount_amount to null
    const maxDiscountAmount = dto.discountType === 'item' ? null : dto.maxDiscountAmount;

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
      maxDiscountAmount: settings.max_discount_amount ? Number(settings.max_discount_amount) : null,
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
      longitude: updatedBranch.longitude ? Number(updatedBranch.longitude) : null,
      contactPhone: updatedBranch.contact_phone,
      isActive: updatedBranch.is_active,
      createdAt: updatedBranch.created_at,
      updatedAt: updatedBranch.updated_at,
    };

    return formattedBranch;
  }

  /**
   * Get corporate dashboard stats (Overview cards)
   * Corporate only
   */
  async getDashboardStats(currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant.id;

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

  async getDashboardAnalytics(currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant.id;

    // Get all branches
    const branches = await this.prisma.merchant_branches.findMany({
      where: { merchant_id: merchantId },
      select: { id: true },
    });
    const branchIds = branches.map((b) => b.id);

    if (branchIds.length === 0) {
      return [];
    }

    // Get redemptions for the last 30 days to show "Peak Hours" trend
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    const redemptions = await this.prisma.redemptions.findMany({
      where: {
        branch_id: { in: branchIds },
        created_at: {
          gte: startDate,
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
  async getBranchPerformance(currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant.id;

    // Get branches and count redemptions individually to be accurate
    // Filter by active merchant accounts similar to getBranches
    const branches = await this.prisma.merchant_branches.findMany({
      where: {
        merchant_id: merchantId,
        merchants: { is_active: true }, // Consistency with getBranches
      },
      include: {
        _count: {
          select: { redemptions: true },
        },
      },
    });

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
  async getOfferPerformance(currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }
    if (!currentUser.merchant?.id) {
      throw new ForbiddenException(
        API_RESPONSE_MESSAGES.MERCHANT.BRANCH_ACCESS_DENIED,
      );
    }

    const merchantId = currentUser.merchant.id;

    // Get offers for this merchant
    const offers = await this.prisma.offers.findMany({
      where: { merchant_id: merchantId },
      select: {
        id: true,
        title: true,
        discount_value: true,
        discount_type: true,
        status: true,
        current_redemptions: true, // This is a counter on the offer table itself
      },
      orderBy: {
        current_redemptions: 'desc',
      },
    });

    const formattedOffers = offers.map((o) => ({
      id: o.id,
      title: o.title,
      discount:
        o.discount_type === 'percentage'
          ? `${o.discount_value}% OFF`
          : `Rs. ${o.discount_value} OFF`,
      status: o.status,
      redemptions: o.current_redemptions || 0,
    }));

    return formattedOffers;
  }

  /**
   * Get merchant details for students
   * Includes branches with bonus settings
   * Student only
   */
  async getMerchantDetailsForStudents(
    merchantId: string,
    userId?: string,
  ): Promise<MerchantDetailsForStudentsResponse> {
    // Get merchant
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: merchantId },
      include: {
        users: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Verify it's a corporate account and is active
    if (merchant.users.role !== ROLES.MERCHANT_CORPORATE) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    if (merchant.verification_status !== 'approved' || !merchant.is_active) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.NOT_FOUND);
    }

    // Get all active branches for this merchant
    const branches = await this.prisma.merchant_branches.findMany({
      where: {
        merchant_id: merchantId,
        is_active: true,
      },
      include: {
        branch_bonus_settings: true,
      },
      orderBy: {
        branch_name: 'asc',
      },
    });

    // Get student branch stats if userId is provided
    let studentBranchStats: Map<string, number> = new Map();
    if (userId) {
      // Get student record
      const student = await this.prisma.students.findUnique({
        where: { user_id: userId },
        select: { id: true },
      });

      if (student) {
        const stats = await this.prisma.student_branch_stats.findMany({
          where: {
            student_id: student.id,
            branch_id: {
              in: branches.map((b) => b.id),
            },
          },
          select: {
            branch_id: true,
            redemption_count: true,
          },
        });

        stats.forEach((stat) => {
          studentBranchStats.set(stat.branch_id, stat.redemption_count || 0);
        });
      }
    }

    // Get active offers for all branches of this merchant
    // Include both branch-specific offers and global offers (no branch assignments)
    const now = new Date();
    const branchIds = branches.map((b) => b.id);

    const offers = await this.prisma.offers.findMany({
      where: {
        merchant_id: merchantId,
        status: 'active',
        valid_from: { lte: now },
        valid_until: { gte: now },
        OR: [
          // Offers assigned to specific branches
          {
            offer_branches: {
              some: {
                branch_id: { in: branchIds },
                is_active: true,
              },
            },
          },
          // Global offers (no branch assignments)
          {
            offer_branches: {
              none: {},
            },
          },
        ],
      },
      include: {
        offer_branches: {
          where: {
            branch_id: { in: branchIds },
            is_active: true,
          },
          select: {
            branch_id: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Create a map of branch_id -> offers for that branch
    const branchOffersMap = new Map<string, BranchOffer[]>();

    // Initialize map with empty arrays for all branches
    branches.forEach((branch) => {
      branchOffersMap.set(branch.id, []);
    });

    // Group offers by branch
    offers.forEach((offer) => {
      const formattedDiscount =
        offer.discount_type === 'percentage'
          ? `${Number(offer.discount_value)}% OFF`
          : `Rs. ${Number(offer.discount_value)} OFF`;

      const branchOffer: BranchOffer = {
        id: offer.id,
        title: offer.title,
        imageUrl: offer.image_url,
        discountType: offer.discount_type,
        discountValue: Number(offer.discount_value),
        formattedDiscount,
      };

      // Check if this is a global offer (no branch assignments)
      if (offer.offer_branches.length === 0) {
        // Global offer: add to all branches
        branches.forEach((branch) => {
          const existingOffers = branchOffersMap.get(branch.id) || [];
          existingOffers.push(branchOffer);
          branchOffersMap.set(branch.id, existingOffers);
        });
      } else {
        // Branch-specific offer: add only to assigned branches
        offer.offer_branches.forEach((ob) => {
          const existingOffers = branchOffersMap.get(ob.branch_id) || [];
          existingOffers.push(branchOffer);
          branchOffersMap.set(ob.branch_id, existingOffers);
        });
      }
    });

    // Format branches with bonus settings and offers
    const formattedBranches: BranchWithBonusSettings[] = branches.map((branch) => {
      const currentRedemptions = studentBranchStats.has(branch.id)
        ? studentBranchStats.get(branch.id) || 0
        : undefined;

      let bonusSettings: BranchWithBonusSettings['bonusSettings'] = null;

      if (branch.branch_bonus_settings) {
        const settings = branch.branch_bonus_settings;
        let discountDescription: string;
        if (settings.discount_type === 'percentage') {
          discountDescription = `${settings.discount_value}% OFF`;
        } else if (settings.discount_type === 'fixed') {
          discountDescription = `Rs. ${settings.discount_value} OFF`;
        } else if (settings.additional_item) {
          discountDescription = settings.additional_item;
        } else {
          discountDescription = 'Bonus Reward';
        }

        bonusSettings = {
          redemptionsRequired: settings.redemptions_required,
          currentRedemptions,
          discountDescription,
          isActive: settings.is_active ?? true,
        };
      }

      return {
        id: branch.id,
        name: branch.branch_name,
        address: branch.address,
        city: branch.city,
        latitude: branch.latitude ? Number(branch.latitude) : null,
        longitude: branch.longitude ? Number(branch.longitude) : null,
        contactPhone: branch.contact_phone,
        bonusSettings,
        offers: branchOffersMap.get(branch.id) || [],
      };
    });

    return {
      id: merchant.id,
      businessName: merchant.business_name,
      logoPath: merchant.logo_path,
      bannerUrl: merchant.banner_url,
      category: merchant.category,
      termsAndConditions: merchant.terms_and_conditions,
      branches: formattedBranches,
    };
  }

  /**
   * Set featured brands (top 6 brands)
   * Admin only
   * Sets featured_order (1-6) for specified brands and clears it for others
   */
  async setFeaturedBrands(dto: SetFeaturedBrandsDto): Promise<{ message: string }> {
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