import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedemptionsService } from '../redemptions/redemptions.service';
import { AuditService } from '../audit/audit.service';
import { InitiateQrRedemptionDto } from './dto/initiate-qr-redemption.dto';
import { RejectQrRedemptionDto } from './dto/reject-qr-redemption.dto';
import { UpdateQrSettingsDto } from './dto/update-qr-settings.dto';
import { ROLES } from '../../constants/app.constants';
import { CurrentUser } from '../../types/global.types';

const QR_REQUEST_TTL_MINUTES = 2;
const DEEP_LINK_BASE = 'https://www.parchipakistan.com/redeem';

function hashToInt32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
  return h;
}

@Injectable()
export class QrRedemptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redemptionsService: RedemptionsService,
    private readonly auditService: AuditService,
  ) {}

  // ── Public: list active offers at a branch ────────────────────────────────

  async getBranchOffers(branchId: string) {
    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        branch_name: true,
        is_active: true,
        merchants: { select: { id: true, business_name: true, logo_path: true } },
      },
    });

    if (!branch) throw new NotFoundException('Branch not found');
    if (!branch.is_active) throw new BadRequestException('Branch is not active');

    const now = new Date();

    const offerBranches = await (this.prisma as any).offer_branches.findMany({
      where: { branch_id: branchId },
      include: {
        offers: {
          select: {
            id: true,
            title: true,
            description: true,
            discount_type: true,
            discount_value: true,
            max_discount_amount: true,
            image_url: true,
            additional_item: true,
            status: true,
            valid_from: true,
            valid_until: true,
          },
        },
      },
    });

    const activeOffers = offerBranches
      .map((ob: any) => ob.offers)
      .filter(
        (o: any) =>
          o &&
          o.status === 'active' &&
          new Date(o.valid_from) <= now &&
          new Date(o.valid_until) >= now,
      )
      .map((o: any) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        discountType: o.discount_type,
        discountValue: Number(o.discount_value),
        maxDiscountAmount: o.max_discount_amount ? Number(o.max_discount_amount) : null,
        imageUrl: o.image_url,
        additionalItem: o.additional_item,
        formattedDiscount: this.formatDiscount(o),
      }));

    return {
      branch: {
        id: branch.id,
        branchName: branch.branch_name,
        merchant: {
          businessName: branch.merchants.business_name,
          logoPath: branch.merchants.logo_path,
        },
      },
      offers: activeOffers,
    };
  }

  // ── Student: initiate a QR redemption request ─────────────────────────────

  async initiateRequest(dto: InitiateQrRedemptionDto, currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException('Only students can initiate QR redemptions');
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
      select: { id: true, verification_status: true },
    });

    if (!student) throw new NotFoundException('Student profile not found');
    if (student.verification_status !== 'approved') {
      throw new ForbiddenException('Your account must be verified to redeem offers');
    }

    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: dto.branchId },
      select: { id: true, is_active: true, qr_auto_approve: true, user_id: true },
    });

    if (!branch) throw new NotFoundException('Branch not found');
    if (!branch.is_active) throw new BadRequestException('Branch is not active');

    // Verify offer is active at this branch
    const now = new Date();
    const offerBranch = await (this.prisma as any).offer_branches.findFirst({
      where: { branch_id: dto.branchId, offer_id: dto.offerId },
      include: {
        offers: {
          select: {
            id: true,
            status: true,
            valid_from: true,
            valid_until: true,
            merchant_id: true,
          },
        },
      },
    });

    if (!offerBranch || !offerBranch.offers) {
      throw new NotFoundException('Offer not available at this branch');
    }

    const offer = offerBranch.offers;
    if (offer.status !== 'active') {
      throw new BadRequestException('Offer is not active');
    }
    if (new Date(offer.valid_from) > now || new Date(offer.valid_until) < now) {
      throw new BadRequestException('Offer has expired');
    }

    const expiresAt = new Date(now.getTime() + QR_REQUEST_TTL_MINUTES * 60 * 1000);

    // Auto-approve path: create redemption directly, no lock needed
    if (branch.qr_auto_approve) {
      const redemption = await this.redemptionsService.createRedemptionByIds({
        studentId: student.id,
        offerId: dto.offerId,
        branchId: dto.branchId,
        verifiedById: branch.user_id ?? currentUser.id,
        notes: 'QR auto-approved',
      });

      const record = await (this.prisma as any).qr_redemption_requests.create({
        data: {
          branch_id: dto.branchId,
          student_id: student.id,
          offer_id: dto.offerId,
          status: 'auto_approved',
          expires_at: expiresAt,
          redemption_id: redemption.id,
        },
      });

      await this.logQrRedemptionCreated({
        redemptionId: redemption.id,
        qrRequestId: record.id,
        studentId: student.id,
        offerId: dto.offerId,
        branchId: dto.branchId,
        verifiedByUserId: branch.user_id ?? currentUser.id,
        method: 'auto_approve',
        notes: 'QR auto-approved',
        isBonusApplied: redemption.isBonusApplied,
        bonusDiscountApplied: redemption.bonusDiscountApplied,
      });

      return {
        requestId: record.id,
        autoApproved: true,
        status: 'auto_approved',
        redemption: {
          id: redemption.id,
          isBonusApplied: redemption.isBonusApplied,
          bonusDiscountApplied: redemption.bonusDiscountApplied,
          bonusDiscountType: redemption.bonusDiscountType,
        },
      };
    }

    // Manual approval: advisory lock serializes concurrent requests from the same student
    // so the second caller always finds the first record and returns the same requestId.
    const lockA = hashToInt32(student.id);
    const lockB = hashToInt32(dto.branchId);

    const { record } = await this.prisma.$transaction(async (tx) => {
      await (tx as any).$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
        lockA,
        lockB,
      );

      const existing = await (tx as any).qr_redemption_requests.findFirst({
        where: {
          student_id: student.id,
          branch_id: dto.branchId,
          status: 'pending',
          expires_at: { gt: now },
        },
      });
      if (existing) return { record: existing };

      const created = await (tx as any).qr_redemption_requests.create({
        data: {
          branch_id: dto.branchId,
          student_id: student.id,
          offer_id: dto.offerId,
          status: 'pending',
          expires_at: expiresAt,
        },
      });
      return { record: created };
    });

    return { requestId: record.id, autoApproved: false, status: 'pending', expiresAt: record.expires_at };
  }

  // ── Student: poll request status ──────────────────────────────────────────

  async getRequestStatus(requestId: string, currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException('Access denied');
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const request = await (this.prisma as any).qr_redemption_requests.findUnique({
      where: { id: requestId },
      include: {
        offers: {
          select: {
            id: true,
            title: true,
            discount_type: true,
            discount_value: true,
            max_discount_amount: true,
            additional_item: true,
            redemption_strategy: true,
          },
        },
        merchant_branches: {
          select: {
            id: true,
            branch_name: true,
            merchant_id: true,
            merchants: { select: { business_name: true, logo_path: true } },
          },
        },
      },
    });

    if (!request) throw new NotFoundException('Request not found');
    if (request.student_id !== student.id) throw new ForbiddenException('Access denied');

    // Auto-expire if past TTL and still pending
    if (request.status === 'pending' && new Date(request.expires_at) < new Date()) {
      await (this.prisma as any).qr_redemption_requests.update({
        where: { id: requestId },
        data: { status: 'expired' },
      });
      return { ...this.formatRequest(request), status: 'expired' };
    }

    // If approved or auto_approved, fetch redemption info
    if ((request.status === 'approved' || request.status === 'auto_approved') && request.redemption_id) {
      const redemption = await this.prisma.redemptions.findUnique({
        where: { id: request.redemption_id },
      });
      if (redemption) {
        const bonusDiscountType = redemption.is_bonus_applied
          ? await this.redemptionsService.resolveBonusDiscountType(
              request.merchant_branches.merchant_id,
              request.offer_id,
              {
                redemptionStrategy: request.offers?.redemption_strategy,
                isBonusApplied: true,
              },
            )
          : null;

        request.redemption = {
          id: redemption.id,
          isBonusApplied: redemption.is_bonus_applied,
          bonusDiscountApplied: redemption.bonus_discount_applied ? Number(redemption.bonus_discount_applied) : null,
          bonusDiscountType,
          offer: request.offers ? {
            title: request.offers.title,
            formattedDiscount: this.formatDiscount(request.offers),
          } : null,
          branch: request.merchant_branches ? {
            branchName: request.merchant_branches.branch_name,
            merchant: request.merchant_branches.merchants ? {
              businessName: request.merchant_branches.merchants.business_name,
              logoPath: request.merchant_branches.merchants.logo_path,
            } : null,
          } : null,
        };
      }
    }

    return this.formatRequest(request);
  }

  // ── Student: cancel a pending request ────────────────────────────────────

  async cancelRequest(requestId: string, currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException('Access denied');
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const request = await (this.prisma as any).qr_redemption_requests.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Request not found');
    if (request.student_id !== student.id) throw new ForbiddenException('Access denied');
    if (request.status !== 'pending') {
      throw new BadRequestException(`Cannot cancel a request with status: ${request.status}`);
    }

    await (this.prisma as any).qr_redemption_requests.update({
      where: { id: requestId },
      data: { status: 'expired' },
    });

    return { success: true };
  }

  // ── Branch: get all pending requests ─────────────────────────────────────

  async getPendingRequests(currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException('Access denied');
    }
    if (!currentUser.branch_id) {
      throw new ForbiddenException('Branch access required');
    }

    const now = new Date();

    // Bulk-expire stale pending requests
    await (this.prisma as any).qr_redemption_requests.updateMany({
      where: { branch_id: currentUser.branch_id, status: 'pending', expires_at: { lt: now } },
      data: { status: 'expired' },
    });

    const requests = await (this.prisma as any).qr_redemption_requests.findMany({
      where: { branch_id: currentUser.branch_id, status: 'pending' },
      include: {
        students: {
          select: {
            id: true,
            parchi_id: true,
            first_name: true,
            last_name: true,
            university: true,
            verification_status: true,
            lifetime_redemptions: true,
            profile_picture: true,
            verification_selfie_path: true,
          },
        },
        offers: {
          select: {
            id: true,
            title: true,
            discount_type: true,
            discount_value: true,
            max_discount_amount: true,
            image_url: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return requests.map((r: any) => ({
      id: r.id,
      status: r.status,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      student: {
        id: r.students.id,
        parchiId: r.students.parchi_id,
        firstName: r.students.first_name,
        lastName: r.students.last_name,
        university: r.students.university,
        verificationStatus: r.students.verification_status,
        totalRedemptions: r.students.lifetime_redemptions || 0,
        profilePicture: r.students.profile_picture,
        verificationSelfie: r.students.verification_selfie_path,
      },
      offer: {
        id: r.offers.id,
        title: r.offers.title,
        discountType: r.offers.discount_type,
        discountValue: Number(r.offers.discount_value),
        maxDiscountAmount: r.offers.max_discount_amount ? Number(r.offers.max_discount_amount) : null,
        imageUrl: r.offers.image_url,
        formattedDiscount: this.formatDiscount(r.offers),
      },
    }));
  }

  // ── Branch: approve a pending request ────────────────────────────────────

  async approveRequest(requestId: string, currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException('Access denied');
    }
    if (!currentUser.branch_id) {
      throw new ForbiddenException('Branch access required');
    }

    const request = await (this.prisma as any).qr_redemption_requests.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Request not found');
    if (request.branch_id !== currentUser.branch_id) throw new ForbiddenException('Access denied');
    if (request.status !== 'pending') {
      throw new BadRequestException(`Cannot approve a request with status: ${request.status}`);
    }
    if (new Date(request.expires_at) < new Date()) {
      await (this.prisma as any).qr_redemption_requests.update({
        where: { id: requestId },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This request has expired');
    }

    const redemption = await this.redemptionsService.createRedemptionByIds({
      studentId: request.student_id,
      offerId: request.offer_id,
      branchId: request.branch_id,
      verifiedById: currentUser.id,
    });

    await (this.prisma as any).qr_redemption_requests.update({
      where: { id: requestId },
      data: { status: 'approved', redemption_id: redemption.id },
    });

    await this.logQrRedemptionCreated({
      redemptionId: redemption.id,
      qrRequestId: requestId,
      studentId: request.student_id,
      offerId: request.offer_id,
      branchId: request.branch_id,
      verifiedByUserId: currentUser.id,
      method: 'manual_approve',
      isBonusApplied: redemption.isBonusApplied,
      bonusDiscountApplied: redemption.bonusDiscountApplied,
    });

    return { success: true };
  }

  // ── Branch: reject a pending request ─────────────────────────────────────

  async rejectRequest(requestId: string, dto: RejectQrRedemptionDto, currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException('Access denied');
    }
    if (!currentUser.branch_id) {
      throw new ForbiddenException('Branch access required');
    }

    const request = await (this.prisma as any).qr_redemption_requests.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Request not found');
    if (request.branch_id !== currentUser.branch_id) throw new ForbiddenException('Access denied');
    if (request.status !== 'pending') {
      throw new BadRequestException(`Cannot reject a request with status: ${request.status}`);
    }

    await (this.prisma as any).qr_redemption_requests.update({
      where: { id: requestId },
      data: { status: 'rejected', rejection_reason: dto.rejectionReason ?? null },
    });

    await this.logQrRedemptionRejected({
      qrRequestId: requestId,
      studentId: request.student_id,
      offerId: request.offer_id,
      branchId: request.branch_id,
      rejectedByUserId: currentUser.id,
      reason: dto.rejectionReason ?? null,
    });

    return { success: true };
  }

  // ── Branch: get QR settings ───────────────────────────────────────────────

  async getQrSettings(currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException('Access denied');
    }
    if (!currentUser.branch_id) {
      throw new ForbiddenException('Branch access required');
    }

    const branch = await this.prisma.merchant_branches.findUnique({
      where: { id: currentUser.branch_id },
      select: { id: true, branch_name: true, qr_auto_approve: true },
    });

    if (!branch) throw new NotFoundException('Branch not found');

    return {
      branchId: branch.id,
      branchName: branch.branch_name,
      qrAutoApprove: branch.qr_auto_approve ?? false,
      qrDeepLink: `${DEEP_LINK_BASE}/${branch.id}`,
    };
  }

  // ── Branch: update QR settings ────────────────────────────────────────────

  async updateQrSettings(dto: UpdateQrSettingsDto, currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.MERCHANT_BRANCH) {
      throw new ForbiddenException('Access denied');
    }
    if (!currentUser.branch_id) {
      throw new ForbiddenException('Branch access required');
    }

    const branch = await this.prisma.merchant_branches.update({
      where: { id: currentUser.branch_id },
      data: { qr_auto_approve: dto.qrAutoApprove },
      select: { id: true, branch_name: true, qr_auto_approve: true },
    });

    return {
      branchId: branch.id,
      branchName: branch.branch_name,
      qrAutoApprove: branch.qr_auto_approve ?? false,
      qrDeepLink: `${DEEP_LINK_BASE}/${branch.id}`,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async logQrRedemptionCreated(params: {
    redemptionId: string;
    qrRequestId: string;
    studentId: string;
    offerId: string;
    branchId: string;
    verifiedByUserId: string;
    method: 'auto_approve' | 'manual_approve';
    notes?: string;
    isBonusApplied: boolean;
    bonusDiscountApplied: number | null;
  }): Promise<void> {
    const context = await this.getQrAuditContext(
      params.studentId,
      params.offerId,
      params.branchId,
    );

    await this.auditService.logCreate(
      'CREATE_QR_REDEMPTION',
      'redemptions',
      params.redemptionId,
      {
        qrRequestId: params.qrRequestId,
        method: params.method,
        notes: params.notes,
        isBonusApplied: params.isBonusApplied,
        bonusDiscountApplied: params.bonusDiscountApplied,
        student: context.student,
        offer: context.offer,
        branch: context.branch,
      },
      params.verifiedByUserId,
    );
  }

  private async logQrRedemptionRejected(params: {
    qrRequestId: string;
    studentId: string;
    offerId: string;
    branchId: string;
    rejectedByUserId: string;
    reason: string | null;
  }): Promise<void> {
    const context = await this.getQrAuditContext(
      params.studentId,
      params.offerId,
      params.branchId,
    );

    await this.auditService.logAction(
      'REJECT_QR_REDEMPTION',
      'qr_redemption_requests',
      params.qrRequestId,
      {
        reason: params.reason,
        student: context.student,
        offer: context.offer,
        branch: context.branch,
      },
      params.rejectedByUserId,
    );
  }

  private async getQrAuditContext(
    studentId: string,
    offerId: string,
    branchId: string,
  ): Promise<{
    student: {
      id: string;
      parchiId: string;
      firstName: string;
      lastName: string;
      university: string | null;
    } | null;
    offer: { id: string; title: string } | null;
    branch: {
      id: string;
      branchName: string;
      merchantName: string | null;
    } | null;
  }> {
    const [student, offer, branch] = await Promise.all([
      this.prisma.students.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          parchi_id: true,
          first_name: true,
          last_name: true,
          university: true,
        },
      }),
      this.prisma.offers.findUnique({
        where: { id: offerId },
        select: { id: true, title: true },
      }),
      this.prisma.merchant_branches.findUnique({
        where: { id: branchId },
        select: {
          id: true,
          branch_name: true,
          merchants: { select: { business_name: true } },
        },
      }),
    ]);

    return {
      student: student
        ? {
            id: student.id,
            parchiId: student.parchi_id ?? '',
            firstName: student.first_name,
            lastName: student.last_name,
            university: student.university,
          }
        : null,
      offer: offer ? { id: offer.id, title: offer.title } : null,
      branch: branch
        ? {
            id: branch.id,
            branchName: branch.branch_name,
            merchantName: branch.merchants?.business_name ?? null,
          }
        : null,
    };
  }

  private formatRequest(r: any) {
    return {
      id: r.id,
      status: r.status,
      rejectionReason: r.rejection_reason ?? null,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      offer: r.offers
        ? {
            id: r.offers.id,
            title: r.offers.title,
            discountType: r.offers.discount_type,
            discountValue: Number(r.offers.discount_value),
          }
        : null,
      branch: r.merchant_branches
        ? {
            id: r.merchant_branches.id,
            branchName: r.merchant_branches.branch_name,
            merchant: r.merchant_branches.merchants
              ? {
                  businessName: r.merchant_branches.merchants.business_name,
                  logoPath: r.merchant_branches.merchants.logo_path,
                }
              : null,
          }
        : null,
      redemption: r.redemption ?? null,
    };
  }

  private formatDiscount(offer: {
    discount_type: string;
    discount_value: any;
    max_discount_amount?: any;
    additional_item?: string | null;
  }): string {
    const value = Number(offer.discount_value);
    if (offer.discount_type === 'percentage') {
      const cap = offer.max_discount_amount ? ` (up to Rs. ${Number(offer.max_discount_amount)})` : '';
      return `${value}% off${cap}`;
    }
    if (offer.discount_type === 'fixed') return `Rs. ${value} off`;
    if (offer.discount_type === 'item') {
      return offer.additional_item ? `Free ${offer.additional_item}` : 'Free item';
    }
    return `${value} off`;
  }
}
