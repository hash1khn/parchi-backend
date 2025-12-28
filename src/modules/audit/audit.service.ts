import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogData {
  action: string;
  tableName?: string;
  recordId?: string;
  oldValues?: any;
  newValues?: any;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: AuditLogData): Promise<void> {
    try {
      await this.prisma.audit_logs.create({
        data: {
          action: data.action,
          table_name: data.tableName,
          record_id: data.recordId,
          old_values: data.oldValues ? JSON.parse(JSON.stringify(data.oldValues)) : null,
          new_values: data.newValues ? JSON.parse(JSON.stringify(data.newValues)) : null,
          user_id: data.userId,
          ip_address: data.ipAddress,
          user_agent: data.userAgent,
        },
      });
    } catch (error) {
      // Log error but don't throw - audit logging should not break the main flow
      console.error('Failed to create audit log:', error);
    }
  }

  async logCreate(
    action: string,
    tableName: string,
    recordId: string,
    newValues: any,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      action,
      tableName,
      recordId,
      newValues,
      userId,
      ipAddress,
      userAgent,
    });
  }

  async logUpdate(
    action: string,
    tableName: string,
    recordId: string,
    oldValues: any,
    newValues: any,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      action,
      tableName,
      recordId,
      oldValues,
      newValues,
      userId,
      ipAddress,
      userAgent,
    });
  }

  async logDelete(
    action: string,
    tableName: string,
    recordId: string,
    oldValues: any,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      action,
      tableName,
      recordId,
      oldValues,
      userId,
      ipAddress,
      userAgent,
    });
  }

  async logAction(
    action: string,
    tableName?: string,
    recordId?: string,
    metadata?: any,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.log({
      action,
      tableName,
      recordId,
      newValues: metadata,
      userId,
      ipAddress,
      userAgent,
    });
  }
}

