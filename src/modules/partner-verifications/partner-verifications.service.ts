import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePartnerVerificationDto } from './dto/create-partner-verification.dto';
import { CurrentUser } from '../../types/global.types';
import { PartnerContext } from '../../decorators/current-partner.decorator';
import { ROLES } from '../../constants/app.constants';
import { hashPartnerKey } from '../../utils/partner-key.util';

const REQUEST_TTL_MINUTES = 2;
const DEEP_LINK_WEB_BASE = 'https://www.parchipakistan.com/verify';
const DEEP_LINK_APP_BASE = 'parchi://verify';
const INSIDE_KARACHI_PARTNER = 'inside_karachi';

function hashToInt32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
  return h;
}

@Injectable()
export class PartnerVerificationsService implements OnModuleInit {
  private readonly logger = new Logger(PartnerVerificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const rawKey = this.configService.get<string>('INSIDE_KARACHI_PARTNER_KEY');
    if (!rawKey?.trim()) {
      this.logger.warn(
        'INSIDE_KARACHI_PARTNER_KEY is not set. Using the migration placeholder hash until it is configured.',
      );
      return;
    }

    await this.prisma.partner_api_keys.upsert({
      where: { partner_name: INSIDE_KARACHI_PARTNER },
      create: {
        partner_name: INSIDE_KARACHI_PARTNER,
        hashed_key: hashPartnerKey(rawKey),
        is_active: true,
      },
      update: {
        hashed_key: hashPartnerKey(rawKey),
        is_active: true,
      },
    });
    this.logger.log('Inside Karachi partner API key hash upserted from environment');
  }

  async createRequest(dto: CreatePartnerVerificationDto, partner: PartnerContext) {
    const student = await this.prisma.students.findUnique({
      where: { parchi_id: dto.parchiId.trim() },
      select: {
        id: true,
        user_id: true,
        parchi_id: true,
        first_name: true,
        last_name: true,
        university: true,
        verification_status: true,
        users: { select: { is_active: true } },
      },
    });

    if (!student) {
      throw new NotFoundException('No student found with this Parchi ID');
    }
    if (student.users?.is_active === false) {
      throw new ForbiddenException('This Parchi account is not active');
    }
    if (student.verification_status !== 'approved') {
      throw new ForbiddenException('This student is not verified');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MINUTES * 60 * 1000);
    const lockA = hashToInt32(student.id);
    const lockB = hashToInt32(`${partner.id}:${dto.externalReference}`);

    const { record, reused } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
        lockA,
        lockB,
      );

      const existing = await tx.partner_verification_requests.findFirst({
        where: {
          student_id: student.id,
          partner_id: partner.id,
          status: 'pending',
          expires_at: { gt: now },
        },
        orderBy: { created_at: 'desc' },
      });

      if (existing && existing.external_reference === dto.externalReference) {
        return { record: existing, reused: true };
      }

      if (existing && existing.external_reference !== dto.externalReference) {
        await tx.partner_verification_requests.update({
          where: { id: existing.id },
          data: { status: 'expired' },
        });
      }

      const created = await tx.partner_verification_requests.create({
        data: {
          partner_id: partner.id,
          student_id: student.id,
          external_reference: dto.externalReference,
          event_label: dto.eventLabel ?? null,
          status: 'pending',
          expires_at: expiresAt,
        },
      });
      return { record: created, reused: false };
    });

    if (!reused) {
      await this.auditService.logCreate(
        'CREATE_PARTNER_VERIFICATION',
        'partner_verification_requests',
        record.id,
        {
          partnerName: partner.partnerName,
          externalReference: dto.externalReference,
          eventLabel: dto.eventLabel ?? null,
          student: {
            id: student.id,
            parchiId: student.parchi_id,
            firstName: student.first_name,
            lastName: student.last_name,
            university: student.university,
          },
        },
        student.user_id,
      );

      this.sendVerificationPush(student.user_id, record.id, partner.partnerName, dto.eventLabel)
        .catch((err) => this.logger.warn(`Failed to send verification push: ${err?.message}`));
    }

    return this.formatPartnerView(record, partner.partnerName);
  }

  async getPartnerRequest(requestId: string, partner: PartnerContext) {
    const request = await this.prisma.partner_verification_requests.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Verification request not found');
    if (request.partner_id !== partner.id) {
      throw new ForbiddenException('Access denied');
    }

    const resolved = await this.expireIfNeeded(request);
    return this.formatPartnerView(resolved, partner.partnerName);
  }

  async getStudentRequest(requestId: string, currentUser: CurrentUser) {
    const student = await this.requireStudent(currentUser);

    const request = await this.prisma.partner_verification_requests.findUnique({
      where: { id: requestId },
      include: {
        partner_api_keys: { select: { partner_name: true } },
      },
    });

    if (!request) throw new NotFoundException('Verification request not found');
    if (request.student_id !== student.id) {
      throw new ForbiddenException('Access denied');
    }

    const resolved = await this.expireIfNeeded(request);
    return this.formatStudentView(resolved, request.partner_api_keys.partner_name);
  }

  async approveRequest(requestId: string, currentUser: CurrentUser) {
    const student = await this.requireStudent(currentUser);
    const request = await this.loadOwnedPending(requestId, student.id);

    const updated = await this.prisma.partner_verification_requests.update({
      where: { id: requestId },
      data: { status: 'approved', approved_at: new Date() },
      include: { partner_api_keys: { select: { partner_name: true } } },
    });

    await this.auditService.logAction(
      'APPROVE_PARTNER_VERIFICATION',
      'partner_verification_requests',
      requestId,
      {
        partnerName: updated.partner_api_keys.partner_name,
        externalReference: request.external_reference,
        eventLabel: request.event_label,
        studentId: student.id,
      },
      currentUser.id,
    );

    return this.formatStudentView(updated, updated.partner_api_keys.partner_name);
  }

  async rejectRequest(requestId: string, currentUser: CurrentUser, reason?: string) {
    const student = await this.requireStudent(currentUser);
    const request = await this.loadOwnedPending(requestId, student.id);

    const updated = await this.prisma.partner_verification_requests.update({
      where: { id: requestId },
      data: { status: 'rejected', rejected_at: new Date() },
      include: { partner_api_keys: { select: { partner_name: true } } },
    });

    await this.auditService.logAction(
      'REJECT_PARTNER_VERIFICATION',
      'partner_verification_requests',
      requestId,
      {
        partnerName: updated.partner_api_keys.partner_name,
        externalReference: request.external_reference,
        eventLabel: request.event_label,
        reason: reason ?? null,
        studentId: student.id,
      },
      currentUser.id,
    );

    return this.formatStudentView(updated, updated.partner_api_keys.partner_name);
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

  private async loadOwnedPending(requestId: string, studentId: string) {
    const request = await this.prisma.partner_verification_requests.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Verification request not found');
    if (request.student_id !== studentId) throw new ForbiddenException('Access denied');

    const resolved = await this.expireIfNeeded(request);
    if (resolved.status === 'expired') {
      throw new BadRequestException('This verification request has expired');
    }
    if (resolved.status !== 'pending') {
      throw new BadRequestException(`Cannot act on a request with status: ${resolved.status}`);
    }
    return resolved;
  }

  private async expireIfNeeded<T extends { id: string; status: string; expires_at: Date }>(
    request: T,
  ): Promise<T> {
    if (request.status === 'pending' && new Date(request.expires_at) < new Date()) {
      await this.prisma.partner_verification_requests.update({
        where: { id: request.id },
        data: { status: 'expired' },
      });
      return { ...request, status: 'expired' };
    }
    return request;
  }

  private async sendVerificationPush(
    userId: string,
    requestId: string,
    partnerName: string,
    eventLabel?: string,
  ) {
    const displayName = this.prettyPartnerName(partnerName);
    const title = 'Confirm your Parchi ID';
    const content = eventLabel
      ? `${displayName} is verifying you for ${eventLabel}`
      : `${displayName} is requesting student verification`;

    await this.notificationsService.sendPersonalNotification(
      userId,
      title,
      content,
      undefined,
      `${DEEP_LINK_APP_BASE}/${requestId}`,
    );
  }

  private prettyPartnerName(name: string) {
    if (name === INSIDE_KARACHI_PARTNER) return 'Inside Karachi';
    return name
      .split(/[_-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private formatPartnerView(
    request: {
      id: string;
      status: string;
      external_reference: string;
      event_label: string | null;
      expires_at: Date;
      created_at: Date;
      approved_at?: Date | null;
    },
    partnerName: string,
  ) {
    return {
      requestId: request.id,
      status: request.status,
      externalReference: request.external_reference,
      eventLabel: request.event_label,
      expiresAt: request.expires_at,
      createdAt: request.created_at,
      approvedAt: request.approved_at ?? null,
      partnerName: this.prettyPartnerName(partnerName),
      verifyDeepLink: `${DEEP_LINK_APP_BASE}/${request.id}`,
      verifyWebLink: `${DEEP_LINK_WEB_BASE}/${request.id}`,
    };
  }

  private formatStudentView(
    request: {
      id: string;
      status: string;
      event_label: string | null;
      expires_at: Date;
      created_at: Date;
      approved_at?: Date | null;
    },
    partnerName: string,
  ) {
    return {
      id: request.id,
      status: request.status,
      eventLabel: request.event_label,
      partnerName: this.prettyPartnerName(partnerName),
      expiresAt: request.expires_at,
      createdAt: request.created_at,
      approvedAt: request.approved_at ?? null,
    };
  }
}
