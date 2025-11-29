import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

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

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all corporate merchants
   * Returns merchants where the associated user has role 'merchant_corporate'
   */
  async getAllCorporateMerchants(): Promise<
    ApiResponse<CorporateMerchantResponse[]>
  > {
    const merchants = await this.prisma.merchants.findMany({
      where: {
        users: {
          role: 'merchant_corporate',
        },
      },
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

    return {
      data: formattedMerchants,
      status: 200,
      message: API_RESPONSE_MESSAGES.MERCHANT.LIST_SUCCESS,
    };
  }

  async getAllBranches() {
    const branches = await this.prisma.merchant_branches.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        merchants: {
          select: {
            business_name: true,
          },
        },
      },
    });

    return {
      data: branches,
      status: 200,
      message: 'Branches retrieved successfully',
    };
  }

  async approveBranch(id: string) {
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (!branch.user_id) {
        throw new NotFoundException('Branch user not found');
    }

    await this.prisma.$transaction([
      this.prisma.merchant_branches.update({
        where: { id },
        data: { is_active: true },
      }),
      this.prisma.public_users.update({
        where: { id: branch.user_id },
        data: { is_active: true },
      }),
    ]);

    return {
      status: 200,
      message: 'Branch approved successfully',
    };
  }

  async rejectBranch(id: string) {
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (!branch.user_id) {
        throw new NotFoundException('Branch user not found');
    }

    // Deleting user will cascade delete branch if configured, 
    // but explicit delete is safer if cascade isn't guaranteed on all relations
    // Schema says: ON DELETE SET NULL for user_id in merchant_branches?
    // Let's check schema.sql... 
    // merchant_branches.user_id REFERENCES users(id) ON DELETE SET NULL
    // So deleting user sets branch.user_id to null.
    // But we want to delete the branch too.
    
    await this.prisma.$transaction([
      this.prisma.merchant_branches.delete({
        where: { id },
      }),
      this.prisma.public_users.delete({
        where: { id: branch.user_id },
      }),
    ]);

    return {
      status: 200,
      message: 'Branch rejected successfully',
    };
  }

  async updateBranch(id: string, updateBranchDto: UpdateBranchDto) {
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const updatedBranch = await this.prisma.merchant_branches.update({
      where: { id },
      data: updateBranchDto,
    });

    return {
      data: updatedBranch,
      status: 200,
      message: 'Branch updated successfully',
    };
  }

  async updateMerchant(id: string, updateMerchantDto: UpdateMerchantDto) {
    const merchant = await this.prisma.merchants.findUnique({
      where: { id },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const updatedMerchant = await this.prisma.merchants.update({
      where: { id },
      data: updateMerchantDto,
    });

    return {
      data: updatedMerchant,
      status: 200,
      message: 'Merchant updated successfully',
    };
  }


  async getMerchantBranches(merchantId: string, currentUser: any) {
    // Access Control
    if (currentUser.role === 'merchant_corporate') {
      // Corporate merchant can only see their own branches
      if (currentUser.merchant?.id !== merchantId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const branches = await this.prisma.merchant_branches.findMany({
      where: { merchant_id: merchantId },
      orderBy: { created_at: 'desc' },
    });

    return {
      data: branches,
      status: 200,
      message: 'Branches retrieved successfully',
    };
  }

  async updateBranchByCorporate(
    branchId: string,
    updateBranchDto: UpdateBranchDto,
    currentUser: any,
  ) {
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Strict Ownership Check
    if (currentUser.merchant?.id !== branch.merchant_id) {
      throw new ForbiddenException('You can only update your own branches');
    }

    const updatedBranch = await this.prisma.merchant_branches.update({
      where: { id: branchId },
      data: updateBranchDto,
    });

    return {
      data: updatedBranch,
      status: 200,
      message: 'Branch updated successfully',
    };
  }
}

