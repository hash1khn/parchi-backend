import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

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
}

