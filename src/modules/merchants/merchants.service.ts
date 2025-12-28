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
  validityDays: number | null;
  isActive: boolean | null;
  imageUrl: string | null;
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
      }),
    );

    return formattedMerchants;
  }

  /**
   * Get all active brands (corporate merchants)
   * Accessible by students
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
      },
      orderBy: {
        business_name: 'asc',
      },
    });

    const formattedBrands = brands.map((brand) => ({
      id: brand.id,
      businessName: brand.business_name,
      logoPath: brand.logo_path,
      category: brand.category,
    }));

    return formattedBrands;
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
    };

    return formattedMerchant;
  }

  /**
   * Update corporate account
   * Admin only
   */
  async updateCorporateAccount(
    id: string,
    updateDto: UpdateCorporateAccountDto,
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

    // Update verification_status if provided
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
   * Corporate only
   */
  async getBranchAssignments(
    currentUser: CurrentUser,
  ): Promise<BranchAssignmentResponse[]> {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE || !currentUser.merchant?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    const branches = await this.prisma.merchant_branches.findMany({
      where: {
        merchant_id: currentUser.merchant.id,
      },
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
   * Corporate only
   */
  async assignOffersToBranch(
    branchId: string,
    dto: AssignOffersDto,
    currentUser: CurrentUser,
  ): Promise<BranchAssignmentResponse> {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE || !currentUser.merchant?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    // Verify branch ownership
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.merchant_id !== currentUser.merchant.id) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND);
    }

    // Verify offers exist and belong to merchant
    const offerIds = [dto.standardOfferId];
    // If bonusOfferId was passed, we ignore it or treat it as another active offer if intended.
    // For now, we only focus on standardOfferId as the primary active offer.

    const count = await this.prisma.offers.count({
      where: {
        id: { in: offerIds },
        merchant_id: currentUser.merchant.id,
      },
    });

    if (count !== offerIds.length) {
      throw new BadRequestException('One or more offers not found or do not belong to you');
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
   * Corporate only
   */
  async getBranchBonusSettings(
    branchId: string,
    currentUser: CurrentUser,
  ): Promise<BonusSettingsResponse> {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE || !currentUser.merchant?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    // Verify branch ownership
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.merchant_id !== currentUser.merchant.id) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND);
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
      validityDays: settings.validity_days,
      isActive: settings.is_active,
      imageUrl: settings.image_url,
    };
  }

  /**
   * Update bonus settings for a branch
   * Corporate only
   */
  async updateBranchBonusSettings(
    branchId: string,
    dto: UpdateBonusSettingsDto,
    currentUser: CurrentUser,
  ): Promise<BonusSettingsResponse> {
    if (currentUser.role !== ROLES.MERCHANT_CORPORATE || !currentUser.merchant?.id) {
      throw new ForbiddenException(API_RESPONSE_MESSAGES.AUTH.FORBIDDEN);
    }

    // Verify branch ownership
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.merchant_id !== currentUser.merchant.id) {
      throw new NotFoundException(API_RESPONSE_MESSAGES.MERCHANT.BRANCH_NOT_FOUND);
    }

    const settings = await this.prisma.branch_bonus_settings.upsert({
      where: { branch_id: branchId },
      update: {
        redemptions_required: dto.redemptionsRequired,
        discount_type: dto.discountType,
        discount_value: dto.discountValue,
        max_discount_amount: dto.maxDiscountAmount,
        validity_days: dto.validityDays,
        is_active: dto.isActive,
        image_url: dto.imageUrl,
      },
      create: {
        branch_id: branchId,
        redemptions_required: dto.redemptionsRequired,
        discount_type: dto.discountType,
        discount_value: dto.discountValue,
        max_discount_amount: dto.maxDiscountAmount,
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
}