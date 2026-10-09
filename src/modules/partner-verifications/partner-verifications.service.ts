import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '@prisma/client';
import { CreatePartnerVerificationDto } from './dto/create-partner-verification.dto';
import { ApprovePartnerVerificationDto } from './dto/approve-partner-verification.dto';
import { CreatePartnerDiscountRedemptionDto } from './dto/create-partner-discount-redemption.dto';
import { CurrentUser } from '../../types/global.types';
import { PartnerContext } from '../../decorators/current-partner.decorator';
import { ROLES } from '../../constants/app.constants';
import {
  hashPartnerKey,
  isStrongPartnerKey,
  MIN_PARTNER_KEY_LENGTH,
  PLACEHOLDER_PARTNER_KEY_HASH,
} from '../../utils/partner-key.util';
import { RateLimiterService } from '../../common/rate-limit/rate-limiter.service';

const REQUEST_TTL_MS = 2 * 60 * 1000;
/** Max new requests per student per partner in the window below (reused requests don't count). */
const MAX_REQUESTS_PER_STUDENT = 5;
const STUDENT_REQUEST_WINDOW_MS = 10 * 60 * 1000;
/** Failed Parchi ID lookups per partner per minute (enumeration guard). */
const MAX_FAILED_LOOKUPS_PER_MIN = 30;

const DEEP_LINK_WEB_BASE = 'https://www.parchipakistan.com/verify';
const DEEP_LINK_APP_BASE = 'parchi://verify';
const DEEP_LINK_MY_TICKETS = 'parchi://tickets';
const INSIDE_KARACHI_PARTNER = 'inside_karachi';

function hashToInt32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
  return h;
}

/** Two-digit number-matching code shown on the partner's screen. */
function generateMatchCode(): string {
  return String(randomInt(10, 100));
}

/**
 * The three choices shown to the student on the push path: the real code plus two
 * decoys, sorted so position leaks nothing. Deterministic per request so repeated
 * GETs (polling) return identical options.
 */
export function buildMatchOptions(requestId: string, code: string): string[] {
  const digest = createHash('sha256').update(`${requestId}:${code}`).digest();
  const options = new Set<string>([code]);
  for (let i = 0; i < digest.length && options.size < 3; i++) {
    options.add(String(10 + (digest[i] % 90)));
  }
  for (let n = 10; options.size < 3; n++) options.add(String(n));
  return [...options].sort();
}

type RequestRow = {
  id: string;
  partner_id: string;
  student_id: string;
  external_reference: string;
  event_label: string | null;
  status: string;
  created_at: Date;
  expires_at: Date;
  approved_at: Date | null;
  rejected_at: Date | null;
  match_code: string | null;
  push_status: string | null;
};

@Injectable()
export class PartnerVerificationsService implements OnModuleInit {
  private readonly logger = new Logger(PartnerVerificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Installs the Inside Karachi key hash from INSIDE_KARACHI_PARTNER_KEY.
   *
   * Fail-closed rules:
   *  - never leaves the public placeholder key active
   *  - never re-activates a key an operator has disabled (revocation survives restarts)
   *  - in production, refuses a missing or short key
   */
  async onModuleInit() {
    const isProd = process.env.NODE_ENV === 'production';
    const rawKey = this.configService.get<string>('INSIDE_KARACHI_PARTNER_KEY')?.trim();

    // Always make sure the public placeholder can never authenticate.
    await this.prisma.partner_api_keys.updateMany({
      where: { hashed_key: PLACEHOLDER_PARTNER_KEY_HASH, is_active: true },
      data: { is_active: false },
    });

    if (!rawKey) {
      this.logger.warn(
        'INSIDE_KARACHI_PARTNER_KEY is not set: partner verification API will reject every request.',
      );
      return;
    }

    if (!isStrongPartnerKey(rawKey)) {
      const msg = `INSIDE_KARACHI_PARTNER_KEY must be at least ${MIN_PARTNER_KEY_LENGTH} characters`;
      if (isProd) {
        this.logger.error(`${msg}. Refusing to install it.`);
        return;
      }
      this.logger.warn(`${msg} (allowed outside production only).`);
    }

    const hashed = hashPartnerKey(rawKey);
    const existing = await this.prisma.partner_api_keys.findUnique({
      where: { partner_name: INSIDE_KARACHI_PARTNER },
    });

    if (!existing) {
      await this.prisma.partner_api_keys.create({
        data: { partner_name: INSIDE_KARACHI_PARTNER, hashed_key: hashed, is_active: true },
      });
      this.logger.log('Inside Karachi partner key installed');
      return;
    }

    if (existing.hashed_key !== hashed) {
      // Rotation: swap the hash but keep the operator's is_active decision.
      await this.prisma.partner_api_keys.update({
        where: { id: existing.id },
        data: { hashed_key: hashed },
      });
      this.logger.log(
        `Inside Karachi partner key rotated (is_active preserved: ${existing.is_active})`,
      );
    }
  }

  // ?? Partner side ????????????????????????????????????????????????????????

  async createRequest(dto: CreatePartnerVerificationDto, partner: PartnerContext) {
    const student = await this.prisma.students.findUnique({
      where: { parchi_id: dto.parchiId.trim() },
      select: {
        id: true,
        user_id: true,
        verification_status: true,
        users: { select: { is_active: true } },
      },
    });

    if (!student) {
      this.noteFailedLookup(partner);
      throw new NotFoundException('No student found with this Parchi ID');
    }
    if (student.users?.is_active === false) {
      this.noteFailedLookup(partner);
      throw new ForbiddenException('This Parchi account is not active');
    }
    if (student.verification_status !== 'approved') {
      this.noteFailedLookup(partner);
      throw new ForbiddenException('This student is not verified');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MS);
    // Serialise everything for (student, partner): different externalReferences for
    // the same student must not race each other into two pending rows.
    const lockA = hashToInt32(student.id);
    const lockB = hashToInt32(partner.id);

    const { record, reused } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', lockA, lockB);

      // Persist expiry for stale pending rows first (also keeps the partial unique index happy).
      await tx.partner_verification_requests.updateMany({
        where: {
          student_id: student.id,
          partner_id: partner.id,
          status: 'pending',
          expires_at: { lte: now },
        },
        data: { status: 'expired' },
      });

      const existing = await tx.partner_verification_requests.findFirst({
        where: { student_id: student.id, partner_id: partner.id, status: 'pending' },
        orderBy: { created_at: 'desc' },
      });

      if (existing && existing.external_reference === dto.externalReference) {
        return { record: existing as RequestRow, reused: true };
      }

      if (existing) {
        await tx.partner_verification_requests.updateMany({
          where: { id: existing.id, status: 'pending' },
          data: { status: 'expired' },
        });
      }

      const recent = await tx.partner_verification_requests.count({
        where: {
          student_id: student.id,
          partner_id: partner.id,
          created_at: { gt: new Date(now.getTime() - STUDENT_REQUEST_WINDOW_MS) },
        },
      });
      if (recent >= MAX_REQUESTS_PER_STUDENT) {
        throw new HttpException(
          {
            statusCode: 429,
            message: 'Too many verification requests for this student. Try again in a few minutes.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const created = await tx.partner_verification_requests.create({
        data: {
          partner_id: partner.id,
          student_id: student.id,
          external_reference: dto.externalReference,
          event_label: dto.eventLabel ?? null,
          status: 'pending',
          expires_at: expiresAt,
          match_code: generateMatchCode(),
        },
      });
      return { record: created as RequestRow, reused: false };
    }, {
      // Remote Postgres (e.g. Supabase) + advisory lock can exceed Prisma's default 5s.
      maxWait: 10_000,
      timeout: 20_000,
    });

    if (!reused) {
      // No student PII here: the request id links back to the student row.
      // The partner (not the student) is the actor, so user_id is left empty.
      await this.auditService.logCreate(
        'CREATE_PARTNER_VERIFICATION',
        'partner_verification_requests',
        record.id,
        {
          partnerId: partner.id,
          partnerName: partner.partnerName,
          studentId: student.id,
          externalReference: dto.externalReference,
          eventLabel: dto.eventLabel ?? null,
        },
      );
    }

    // Send on first creation, and re-send on a retry if the earlier push failed.
    if (!reused || record.push_status === 'failed') {
      void this.dispatchPush(student.user_id, record, partner.partnerName);
    }

    return this.formatPartnerView(record, partner.partnerName);
  }

  async getPartnerRequest(requestId: string, partner: PartnerContext) {
    const request = await this.prisma.partner_verification_requests.findUnique({
      where: { id: requestId },
    });

    // 404 for both "missing" and "someone else's": never confirm another partner's IDs exist.
    if (!request || request.partner_id !== partner.id) {
      throw new NotFoundException('Verification request not found');
    }

    const resolved = await this.expireIfNeeded(request as RequestRow);
    return this.formatPartnerView(resolved, partner.partnerName);
  }

  // ?? Student side ????????????????????????????????????????????????????????

  async getStudentRequest(requestId: string, currentUser: CurrentUser) {
    const student = await this.requireStudent(currentUser);
    const { request, partnerName } = await this.findOwned(requestId, student.id);
    const resolved = await this.expireIfNeeded(request);
    return this.formatStudentView(resolved, partnerName);
  }

  async approveRequest(
    requestId: string,
    currentUser: CurrentUser,
    dto: ApprovePartnerVerificationDto = {},
  ) {
    const student = await this.requireStudent(currentUser);
    const { request, partnerName } = await this.findOwned(requestId, student.id);
    const resolved = await this.expireIfNeeded(request);

    // Idempotent: repeating an approve that already succeeded returns the same result.
    if (resolved.status === 'approved') return this.formatStudentView(resolved, partnerName);
    this.assertActionable(resolved, 'approve');

    // Push / link path requires number matching. In-app QR scan proves presence.
    const method = dto.method ?? 'push';
    if (method !== 'qr' && resolved.match_code && dto.matchCode !== resolved.match_code) {
      // Fail closed: a wrong pick cancels the request, so it cannot be brute-forced.
      const cancelled = await this.transition(resolved, student.id, 'rejected');
      if (cancelled) {
        await this.auditService.logAction(
          'REJECT_PARTNER_VERIFICATION',
          'partner_verification_requests',
          requestId,
          { partnerName, studentId: student.id, reason: 'match_code_mismatch' },
          currentUser.id,
        );
      }
      throw new BadRequestException('That code did not match. This request has been cancelled.');
    }

    const updated = await this.transition(resolved, student.id, 'approved');
    if (!updated) return this.resolveLostRace(requestId, student.id, partnerName, 'approved');

    await this.auditService.logAction(
      'APPROVE_PARTNER_VERIFICATION',
      'partner_verification_requests',
      requestId,
      {
        partnerName,
        externalReference: resolved.external_reference,
        eventLabel: resolved.event_label,
        studentId: student.id,
        method,
      },
      currentUser.id,
    );

    return this.formatStudentView(updated, partnerName);
  }

  async rejectRequest(requestId: string, currentUser: CurrentUser, reason?: string) {
    const student = await this.requireStudent(currentUser);
    const { request, partnerName } = await this.findOwned(requestId, student.id);
    const resolved = await this.expireIfNeeded(request);

    if (resolved.status === 'rejected') return this.formatStudentView(resolved, partnerName);
    this.assertActionable(resolved, 'reject');

    const updated = await this.transition(resolved, student.id, 'rejected');
    if (!updated) return this.resolveLostRace(requestId, student.id, partnerName, 'rejected');

    await this.auditService.logAction(
      'REJECT_PARTNER_VERIFICATION',
      'partner_verification_requests',
      requestId,
      {
        partnerName,
        externalReference: resolved.external_reference,
        eventLabel: resolved.event_label,
        reason: reason ?? null,
        studentId: student.id,
      },
      currentUser.id,
    );

    return this.formatStudentView(updated, partnerName);
  }

  // ?? Internals ???????????????????????????????????????????????????????????

  private noteFailedLookup(partner: PartnerContext) {
    const result = this.rateLimiter.consume(
      `partner-failed-lookup:${partner.id}`,
      MAX_FAILED_LOOKUPS_PER_MIN,
      60_000,
    );
    if (!result.allowed) {
      throw new HttpException(
        { statusCode: 429, message: 'Too many failed lookups', error: 'Too Many Requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async requireStudent(currentUser: CurrentUser) {
    if (currentUser.role !== ROLES.STUDENT) {
      throw new ForbiddenException('Only students can respond to verification requests');
    }

    const student = await this.prisma.students.findUnique({
      where: { user_id: currentUser.id },
      select: { id: true, verification_status: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    if (student.verification_status !== 'approved') {
      throw new ForbiddenException('Your account must be verified');
    }
    return student;
  }

  /** 404 (not 403) when the request is not this student's: no existence oracle, and no auth side effects in clients. */
  private async findOwned(requestId: string, studentId: string) {
    const request = await this.prisma.partner_verification_requests.findUnique({
      where: { id: requestId },
      include: { partner_api_keys: { select: { partner_name: true } } },
    });

    if (!request || request.student_id !== studentId) {
      throw new NotFoundException('Verification request not found');
    }
    const { partner_api_keys, ...row } = request;
    return { request: row as RequestRow, partnerName: partner_api_keys.partner_name };
  }

  private assertActionable(request: RequestRow, action: 'approve' | 'reject') {
    if (request.status === 'expired') {
      throw new GoneException('This verification request has expired');
    }
    if (request.status !== 'pending') {
      throw new ConflictException(`This request was already ${request.status}; cannot ${action} it`);
    }
  }

  /**
   * Single-statement conditional transition. Succeeds only if the row is still pending,
   * still unexpired, and belongs to this student. Returns the updated row or null when
   * another writer got there first (approve/reject race, double tap, two devices, TTL).
   */
  private async transition(
    request: RequestRow,
    studentId: string,
    to: 'approved' | 'rejected',
  ): Promise<RequestRow | null> {
    const now = new Date();
    const result = await this.prisma.partner_verification_requests.updateMany({
      where: {
        id: request.id,
        student_id: studentId,
        status: 'pending',
        expires_at: { gt: now },
      },
      data:
        to === 'approved'
          ? { status: 'approved', approved_at: now }
          : { status: 'rejected', rejected_at: now },
    });
    if (result.count !== 1) return null;

    return {
      ...request,
      status: to,
      approved_at: to === 'approved' ? now : request.approved_at,
      rejected_at: to === 'rejected' ? now : request.rejected_at,
    };
  }

  /** We lost a race: report the truth. Same outcome as requested is success (idempotent), otherwise a clear error. */
  private async resolveLostRace(
    requestId: string,
    studentId: string,
    partnerName: string,
    wanted: 'approved' | 'rejected',
  ) {
    const { request } = await this.findOwned(requestId, studentId);
    const current = await this.expireIfNeeded(request);
    if (current.status === wanted) return this.formatStudentView(current, partnerName);
    if (current.status === 'expired') throw new GoneException('This verification request has expired');
    throw new ConflictException(`This request was already ${current.status}`);
  }

  /**
   * Persists expiry with a conditional update so it can never overwrite an approve/reject
   * that committed first. Returns the row as it really is afterwards.
   */
  private async expireIfNeeded<T extends RequestRow>(request: T): Promise<T> {
    if (request.status !== 'pending' || new Date(request.expires_at).getTime() > Date.now()) {
      return request;
    }

    const result = await this.prisma.partner_verification_requests.updateMany({
      where: { id: request.id, status: 'pending', expires_at: { lte: new Date() } },
      data: { status: 'expired' },
    });
    if (result.count === 1) return { ...request, status: 'expired' } as T;

    const fresh = await this.prisma.partner_verification_requests.findUnique({
      where: { id: request.id },
    });
    return fresh ? ({ ...request, ...(fresh as RequestRow) } as T) : request;
  }

  private async dispatchPush(userId: string, record: RequestRow, partnerName: string) {
    let status = 'failed';
    try {
      const result: any = await this.notificationsService.sendPersonalNotification(
        userId,
        'Confirm your Parchi ID',
        this.pushBody(partnerName, record.event_label),
        undefined,
        `${DEEP_LINK_APP_BASE}/${record.id}`,
      );
      if (result?.success) {
        status = (result.successCount ?? 0) > 0 ? 'sent' : 'no_device';
      }
    } catch (err: any) {
      this.logger.warn(`Verification push threw for request ${record.id}: ${err?.message}`);
    }

    if (status !== 'sent') {
      this.logger.warn(`Verification push ${status} for request ${record.id} (partner ${partnerName})`);
    }

    try {
      await this.prisma.partner_verification_requests.update({
        where: { id: record.id },
        data: { push_status: status, push_sent_at: status === 'sent' ? new Date() : null },
      });
    } catch (err: any) {
      this.logger.warn(`Could not record push status for ${record.id}: ${err?.message}`);
    }
  }

  private pushBody(partnerName: string, eventLabel: string | null) {
    const displayName = this.prettyPartnerName(partnerName);
    return eventLabel
      ? `${displayName} is verifying you for ${eventLabel}`
      : `${displayName} is requesting student verification`;
  }

  private prettyPartnerName(name: string) {
    if (name === INSIDE_KARACHI_PARTNER) return 'Inside Karachi';
    return name
      .split(/[_-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private formatPartnerView(request: RequestRow, partnerName: string) {
    return {
      requestId: request.id,
      status: request.status,
      externalReference: request.external_reference,
      eventLabel: request.event_label,
      expiresAt: request.expires_at,
      createdAt: request.created_at,
      approvedAt: request.approved_at ?? null,
      partnerName: this.prettyPartnerName(partnerName),
      // Show this on the checkout screen ("tap <code> in your Parchi app"). Only while pending.
      matchCode: request.status === 'pending' ? request.match_code : null,
      // Push uses the plain custom-scheme link (number-matching required).
      verifyDeepLink: `${DEEP_LINK_APP_BASE}/${request.id}`,
      // Web / QR link marks presence so the app can skip number-matching.
      verifyWebLink: `${DEEP_LINK_WEB_BASE}/${request.id}?via=qr`,
    };
  }

  private formatStudentView(request: RequestRow, partnerName: string) {
    return {
      id: request.id,
      status: request.status,
      eventLabel: request.event_label,
      partnerName: this.prettyPartnerName(partnerName),
      expiresAt: request.expires_at,
      createdAt: request.created_at,
      approvedAt: request.approved_at ?? null,
      // Choices for number matching (the correct one is NOT flagged).
      matchOptions:
        request.status === 'pending' && request.match_code
          ? buildMatchOptions(request.id, request.match_code)
          : null,
      // Lets the app correct for a wrong device clock when showing the countdown.
      serverTime: new Date(),
    };
  }

  // ── Discount redemption log (paid checkout with Parchi discount applied) ─

  async recordDiscountRedemption(
    dto: CreatePartnerDiscountRedemptionDto,
    partner: PartnerContext,
  ): Promise<{ data: ReturnType<PartnerVerificationsService['formatDiscountRedemption']>; created: boolean }> {
    const request = await this.prisma.partner_verification_requests.findUnique({
      where: { id: dto.verificationRequestId },
      include: { students: { select: { parchi_id: true, user_id: true } } },
    });

    if (!request || request.partner_id !== partner.id) {
      throw new NotFoundException('Verification request not found');
    }
    if (request.status !== 'approved') {
      throw new ConflictException(
        `Discount can only be logged for an approved verification (status: ${request.status})`,
      );
    }
    if (request.students.parchi_id !== dto.parchiId.trim()) {
      throw new BadRequestException('parchiId does not match this verification request');
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const eventLabel = dto.eventLabel ?? request.event_label;

    try {
      const created = await this.prisma.partner_discount_redemptions.create({
        data: {
          partner_id: partner.id,
          student_id: request.student_id,
          verification_request_id: request.id,
          external_reference: dto.externalReference,
          event_label: eventLabel,
          discount_amount_pkr: dto.discountAmountPkr,
          order_total_pkr: dto.orderTotalPkr ?? null,
          currency: dto.currency ?? 'PKR',
          paid_at: paidAt,
        },
      });

      await this.auditService.logCreate(
        'CREATE_PARTNER_DISCOUNT_REDEMPTION',
        'partner_discount_redemptions',
        created.id,
        {
          partnerId: partner.id,
          studentId: request.student_id,
          verificationRequestId: request.id,
          externalReference: dto.externalReference,
          discountAmountPkr: dto.discountAmountPkr,
          orderTotalPkr: dto.orderTotalPkr ?? null,
          currency: dto.currency ?? 'PKR',
        },
      );

      void this.dispatchDiscountPush(
        request.students.user_id,
        request.id,
        partner.partnerName,
        eventLabel,
        dto.discountAmountPkr,
      );

      return { data: this.formatDiscountRedemption(created), created: true };
    } catch (err) {
      if (this.isUniqueConstraint(err)) {
        const existing = await this.resolveDiscountRedemptionConflict(
          partner.id,
          request.id,
          dto.externalReference,
        );
        return { data: this.formatDiscountRedemption(existing), created: false };
      }
      throw err;
    }
  }

  /**
   * Student poll endpoint: returns the paid-checkout attribution row for this verification,
   * or 404 until the partner posts it.
   */
  async getStudentDiscountRedemption(requestId: string, currentUser: CurrentUser) {
    const student = await this.requireStudent(currentUser);
    const { partnerName } = await this.findOwned(requestId, student.id);

    const row = await this.prisma.partner_discount_redemptions.findFirst({
      where: { verification_request_id: requestId, student_id: student.id },
    });
    if (!row) {
      throw new NotFoundException('Discount redemption not found');
    }

    return {
      ...this.formatDiscountRedemption(row),
      partnerName: this.prettyPartnerName(partnerName),
    };
  }

  private async dispatchDiscountPush(
    userId: string,
    verificationRequestId: string,
    partnerName: string,
    eventLabel: string | null,
    discountAmountPkr: number,
  ) {
    const displayName = this.prettyPartnerName(partnerName);
    const amount = this.formatPkrAmount(discountAmountPkr);
    const body = eventLabel
      ? `You saved Rs. ${amount} at ${displayName} for ${eventLabel}!`
      : `You saved Rs. ${amount} at ${displayName}!`;

    try {
      await this.notificationsService.sendPersonalNotification(
        userId,
        'Discount unlocked',
        body,
        undefined,
        DEEP_LINK_MY_TICKETS,
      );
    } catch (err: any) {
      this.logger.warn(
        `Discount redemption push failed for verification ${verificationRequestId}: ${err?.message}`,
      );
    }
  }

  private formatPkrAmount(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return Number(value.toFixed(2)).toString();
  }

  private isUniqueConstraint(err: unknown): boolean {
    return (
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
      (!!err && typeof err === 'object' && (err as { code?: string }).code === 'P2002')
    );
  }

  async getDiscountRedemption(redemptionId: string, partner: PartnerContext) {
    const row = await this.prisma.partner_discount_redemptions.findUnique({
      where: { id: redemptionId },
    });
    if (!row || row.partner_id !== partner.id) {
      throw new NotFoundException('Discount redemption not found');
    }
    return this.formatDiscountRedemption(row);
  }

  /**
   * Identical retry (same verification + same order) → existing row.
   * Either unique key bound to a *different* pairing → 409, never 200 with another checkout.
   */
  private async resolveDiscountRedemptionConflict(
    partnerId: string,
    verificationRequestId: string,
    externalReference: string,
  ) {
    const [byVerification, byOrder] = await Promise.all([
      this.prisma.partner_discount_redemptions.findFirst({
        where: { partner_id: partnerId, verification_request_id: verificationRequestId },
      }),
      this.prisma.partner_discount_redemptions.findFirst({
        where: { partner_id: partnerId, external_reference: externalReference },
      }),
    ]);

    if (byVerification && byOrder && byVerification.id !== byOrder.id) {
      throw new ConflictException(
        'This verification and this order were already logged as separate checkouts',
      );
    }

    const existing = byVerification ?? byOrder;
    if (
      existing &&
      existing.verification_request_id === verificationRequestId &&
      existing.external_reference === externalReference
    ) {
      return existing;
    }

    if (existing?.verification_request_id === verificationRequestId) {
      throw new ConflictException('This verification was already logged against a different order');
    }
    if (existing?.external_reference === externalReference) {
      throw new ConflictException('This order was already logged against a different verification');
    }

    throw new ConflictException('Discount redemption already recorded');
  }

  private formatDiscountRedemption(row: {
    id: string;
    verification_request_id: string;
    external_reference: string;
    event_label: string | null;
    discount_amount_pkr: Prisma.Decimal | number;
    order_total_pkr: Prisma.Decimal | number | null;
    currency: string;
    paid_at: Date;
    created_at: Date;
  }) {
    return {
      redemptionId: row.id,
      verificationRequestId: row.verification_request_id,
      externalReference: row.external_reference,
      eventLabel: row.event_label,
      discountAmountPkr: Number(row.discount_amount_pkr),
      orderTotalPkr: row.order_total_pkr == null ? null : Number(row.order_total_pkr),
      currency: row.currency,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  }
}
