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

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

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

    // Get old values (for updates) - this would need to be fetched before the operation
    // For now, we'll log after the operation completes
    const oldValues = auditMetadata.getOldValues
      ? auditMetadata.getOldValues([request.body, request.params, request.query])
      : undefined;

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
              await this.auditService.logCreate(
                auditMetadata.action,
                auditMetadata.tableName || 'unknown',
                recordId || 'unknown',
                newValues || response?.data || response,
                user?.id,
                ipAddress,
                userAgent,
              );
            } else if (isUpdate) {
              // For approve/reject operations, enhance the logged data with action type and reviewer info
              let enhancedNewValues = newValues || response?.data || response;
              if (auditMetadata.action === 'APPROVE_REJECT_STUDENT' || 
                  auditMetadata.action === 'APPROVE_REJECT_BRANCH' ||
                  auditMetadata.action === 'APPROVE_REJECT_OFFER') {
                enhancedNewValues = {
                  ...enhancedNewValues,
                  action: request.body?.action, // 'approve' or 'reject'
                  reviewerId: user?.id,
                  reviewerEmail: user?.email,
                  reviewNotes: request.body?.reviewNotes || null,
                };
              }

              await this.auditService.logUpdate(
                auditMetadata.action,
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

