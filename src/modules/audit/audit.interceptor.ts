import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_METADATA_KEY, AuditMetadata } from '../../decorators/audit.decorator';
import { CurrentUser } from '../../types/global.types';

import { PrismaService } from '../prisma/prisma.service';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    const controller = context.getClass();

    // Get audit metadata from decorator
    const auditMetadata = this.reflector.getAllAndOverride<AuditMetadata>(
      AUDIT_METADATA_KEY,
      [handler, controller],
    );

    // If no audit metadata, skip logging
    if (!auditMetadata || auditMetadata.skipLogging) {
      return next.handle();
    }

    // Extract request information
    const user: CurrentUser | undefined = request.user;
    const ipAddress = this.getIpAddress(request);
    const userAgent = request.headers?.['user-agent'] || undefined;

    // Extract record ID
    let recordId: string | undefined;
    if (auditMetadata.recordIdParam) {
      recordId = request.params?.[auditMetadata.recordIdParam] || request.params?.id;
    } else if (auditMetadata.getRecordId) {
      // Pass request object so getRecordId can access user, params, body, etc.
      recordId = auditMetadata.getRecordId([request.body, request.params, request.query, request]);
    } else {
      recordId = request.params?.id;
    }

    const method = request.method.toUpperCase();
    const isUpdate = method === 'PUT' || method === 'PATCH';

    // We use from() and switchMap to handle the async oldValues fetching
    return from(this.getOldValues(auditMetadata, request, recordId, isUpdate)).pipe(
      switchMap(oldValues => {
        // Get new values
        const newValues = auditMetadata.getNewValues
          ? auditMetadata.getNewValues([request.body, request.params, request.query])
          : request.body;

        // Intercept the response to log after operation completes
        return next.handle().pipe(
          tap({
            next: async (response) => {
          try {
            // Extract record ID from response if not already available
            if (!recordId && response?.data?.id) {
              recordId = response.data.id;
            } else if (!recordId && response?.id) {
              recordId = response.id;
            }

            // Determine if this is a create, update, or delete operation
            const method = request.method.toUpperCase();
            const isCreate = method === 'POST';
            const isUpdate = method === 'PUT' || method === 'PATCH';
            const isDelete = method === 'DELETE';

            if (isCreate) {
              let enhancedNewValues = newValues || response?.data || response;

              // Enhance CREATE_REDEMPTION with response data (student details, etc.)
              if (auditMetadata.action === 'CREATE_REDEMPTION') {
                const redemptionData = response?.data || response;
                enhancedNewValues = {
                  ...(typeof enhancedNewValues === 'object' ? enhancedNewValues : {}),
                  student: redemptionData?.student,
                  offer: redemptionData?.offer,
                  branch: redemptionData?.branch,
                };
              }

              await this.auditService.logCreate(
                auditMetadata.action,
                auditMetadata.tableName || 'unknown',
                recordId || 'unknown',
                enhancedNewValues,
                user?.id,
                ipAddress,
                userAgent,
              );
            } else if (isUpdate) {
              // For approve/reject operations, enhance the logged data with student/entity details from response
              let enhancedNewValues = newValues || request.body;
              let action = auditMetadata.action;

              if (auditMetadata.action === 'APPROVE_REJECT_STUDENT') {
                action = request.body?.action === 'approve' ? 'APPROVE_STUDENT' : 'REJECT_STUDENT';
                // Extract student data from the response
                const studentData = response?.data || response;
                enhancedNewValues = {
                  action: request.body?.action, // 'approve' or 'reject'
                  reviewerId: user?.id,
                  reviewerEmail: user?.email,
                  reviewNotes: request.body?.reviewNotes || null,
                  // Add student details
                  parchiId: studentData?.parchiId,
                  firstName: studentData?.firstName,
                  lastName: studentData?.lastName,
                  university: studentData?.university,
                  verificationStatus: studentData?.verificationStatus,
                };
              } else if (auditMetadata.action === 'APPROVE_REJECT_BRANCH' ||
                auditMetadata.action === 'APPROVE_REJECT_OFFER') {
                if (auditMetadata.action === 'APPROVE_REJECT_BRANCH') {
                  action = request.body?.action === 'approve' ? 'APPROVE_BRANCH' : 'REJECT_BRANCH';
                } else {
                  action = request.body?.action === 'approve' ? 'APPROVE_OFFER' : 'REJECT_OFFER';
                }
                enhancedNewValues = {
                  ...enhancedNewValues,
                  action: request.body?.action,
                  reviewerId: user?.id,
                  reviewerEmail: user?.email,
                  reviewNotes: request.body?.reviewNotes || null,
                };
              }

              await this.auditService.logUpdate(
                action,
                auditMetadata.tableName || 'unknown',
                recordId || 'unknown',
                oldValues,
                enhancedNewValues,
                user?.id,
                ipAddress,
                userAgent,
              );
            } else if (isDelete) {
              await this.auditService.logDelete(
                auditMetadata.action,
                auditMetadata.tableName || 'unknown',
                recordId || 'unknown',
                oldValues,
                user?.id,
                ipAddress,
                userAgent,
              );
            } else {
              // Generic action logging
              await this.auditService.logAction(
                auditMetadata.action,
                auditMetadata.tableName,
                recordId,
                newValues || response?.data || response,
                user?.id,
                ipAddress,
                userAgent,
              );
              }
            } catch (error) {
              // Don't fail the request if audit logging fails
              console.error('Audit logging error:', error);
            }
          },
          error: async (error) => {
            // Optionally log failed operations
            // For now, we'll skip logging errors to avoid noise
          },
        }),
      );
    })
    );
  }

  private async getOldValues(
    auditMetadata: AuditMetadata,
    request: any,
    recordId?: string,
    isUpdate?: boolean
  ): Promise<any> {
    // 1. If explicit getOldValues provided in decorator, use it
    if (auditMetadata.getOldValues) {
      return auditMetadata.getOldValues([request.body, request.params, request.query]);
    }

    // 2. If it's an update and we have tableName + recordId, fetch from DB
    if (isUpdate && auditMetadata.tableName && recordId && recordId !== 'unknown') {
      try {
        const tableName = auditMetadata.tableName;
        // Basic check to see if the table exists on prisma client
        if ((this.prisma as any)[tableName]) {
          return await (this.prisma as any)[tableName].findUnique({
            where: { id: recordId }
          });
        }
      } catch (e) {
        console.warn(`Failed to fetch old values for audit log on table ${auditMetadata.tableName}:`, e.message);
      }
    }

    return undefined;
  }

  private getIpAddress(request: any): string | undefined {
    return (
      request.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers?.['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip
    );
  }
}

