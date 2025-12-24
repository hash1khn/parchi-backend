import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ApiResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { UpdateCorporateAccountDto } from './dto/update-corporate-account.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ROLES } from '../../constants/app.constants';
import { CurrentUser } from '../../types/global.types';
import { createApiResponse } from '../../utils/serializer.util';

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

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all corporate merchants
   * Returns merchants where the associated user has role 'merchant_corporate'
   * Supports optional search parameter to filter by business name, email, or phone
   */
  async getAllCorporateMerchants(
    search?: string,
  ): Promise<ApiResponse<CorporateMerchantResponse[]>> {
    const whereClause: Prisma.merchantsWhereInput = {
      users: {
        role: 'merchant_corporate',
      },
    };

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

    return createApiResponse(
      formattedMerchants,
      API_RESPONSE_MESSAGES.MERCHANT.LIST_SUCCESS,
    );
  }
  
  /**
   * Get all active brands (corporate merchants)
   * Accessible by students
   */
  async getAllBrands(): Promise<ApiResponse<Partial<CorporateMerchantResponse>[]>> {
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
        merchant_bonus_settings: {
          select: {
            discount_type: true,
            discount_value: true,
          },
        },
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
      discountType: brand.merchant_bonus_settings?.discount_type,
      discountValue: brand.merchant_bonus_settings?.discount_value
        ? Number(brand.merchant_bonus_settings.discount_value)
        : null,
    }));

    return createApiResponse(
      formattedBrands,
      'Brands retrieved successfully',
    );
  }

  /**
   * Get corporate account by ID
   * Admin only
   */
  async getCorporateAccountById(
    id: string,
  ): Promise<ApiResponse<CorporateMerchantResponse>> {
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

    return createApiResponse(
      formattedMerchant,
      API_RESPONSE_MESSAGES.MERCHANT.GET_SUCCESS,
    );
  }

  /**
   * Update corporate account
   * Admin only
   */
  async updateCorporateAccount(
    id: string,
    updateDto: UpdateCorporateAccountDto,
  ): Promise<ApiResponse<CorporateMerchantResponse>> {
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

    return createApiResponse(
      formattedMerchant,
      API_RESPONSE_MESSAGES.MERCHANT.UPDATE_SUCCESS,
    );
  }

  /**
   * Toggle corporate account status (active/inactive)
   * Admin only
   * When deactivating, cascades deactivation to all branches
   */
  async toggleCorporateAccountStatus(
    id: string,
  ): Promise<ApiResponse<CorporateMerchantResponse>> {
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

    return createApiResponse(
      formattedMerchant,
      API_RESPONSE_MESSAGES.MERCHANT.TOGGLE_SUCCESS,
    );
  }

  /**
   * Delete corporate account
   * Admin only
   * This will cascade delete related branches and other related records
   */
  async deleteCorporateAccount(id: string): Promise<ApiResponse<null>> {
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

    return createApiResponse(
      null,
      API_RESPONSE_MESSAGES.MERCHANT.DELETE_SUCCESS,
    );
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
  ): Promise<ApiResponse<BranchResponse[]>> {
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

    return createApiResponse(
      formattedBranches,
      API_RESPONSE_MESSAGES.MERCHANT.BRANCH_LIST_SUCCESS,
    );
  }

  /**
   * Get branch by ID
   * Admin: can view any branch
   * Corporate: can only view their own branches
   */
  async getBranchById(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<BranchResponse>> {
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

    return createApiResponse(
      formattedBranch,
      API_RESPONSE_MESSAGES.MERCHANT.BRANCH_GET_SUCCESS,
    );
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
  ): Promise<ApiResponse<BranchResponse>> {
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

    return createApiResponse(
      formattedBranch,
      API_RESPONSE_MESSAGES.MERCHANT.BRANCH_UPDATE_SUCCESS,
    );
  }

  /**
   * Delete branch
   * Admin: can delete any branch
   * Corporate: can only delete their own branches
   */
  async deleteBranch(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ApiResponse<null>> {
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

    return createApiResponse(
      null,
      API_RESPONSE_MESSAGES.MERCHANT.BRANCH_DELETE_SUCCESS,
    );
  }

  /**
   * Approve or reject branch
   * Admin only
   * Updates both merchant_branches.is_active and public_users.is_active
   */
  async approveRejectBranch(
    id: string,
    action: 'approved' | 'rejected',
  ): Promise<ApiResponse<BranchResponse>> {
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

    return createApiResponse(
      formattedBranch,
      action === 'approved'
        ? API_RESPONSE_MESSAGES.MERCHANT.BRANCH_APPROVE_SUCCESS
        : API_RESPONSE_MESSAGES.MERCHANT.BRANCH_REJECT_SUCCESS,
    );
  }
}

