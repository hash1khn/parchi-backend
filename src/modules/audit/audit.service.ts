import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { calculatePaginationMeta, calculateSkip } from '../../utils/pagination.util';
import { Prisma } from '@prisma/client';

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

  /**
   * Get audit logs with filtering and pagination
   * Admin only
   */
  async getAuditLogs(queryDto: QueryAuditLogsDto) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    const skip = calculateSkip(page, limit);

    // Build where clause
    const where: Prisma.audit_logsWhereInput = {};

    if (queryDto.userId) {
      where.user_id = queryDto.userId;
    }

    if (queryDto.action) {
      where.action = {
        contains: queryDto.action,
        mode: 'insensitive',
      };
    }

    if (queryDto.tableName) {
      where.table_name = {
        contains: queryDto.tableName,
        mode: 'insensitive',
      };
    }

    if (queryDto.recordId) {
      where.record_id = queryDto.recordId;
    }

    if (queryDto.startDate || queryDto.endDate) {
      where.created_at = {};
      if (queryDto.startDate) {
        where.created_at.gte = new Date(queryDto.startDate);
      }
      if (queryDto.endDate) {
        where.created_at.lte = new Date(queryDto.endDate);
      }
    }

    // Search functionality - search in action, table_name, or user email
    if (queryDto.search) {
      where.OR = [
        {
          action: {
            contains: queryDto.search,
            mode: 'insensitive',
          },
        },
        {
          table_name: {
            contains: queryDto.search,
            mode: 'insensitive',
          },
        },
        {
          users: {
            email: {
              contains: queryDto.search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    // Determine sort order
    const orderBy: Prisma.audit_logsOrderByWithRelationInput = {
      created_at: queryDto.sort === 'oldest' ? 'asc' : 'desc',
    };

    // Get total count and logs
    const [total, logs] = await Promise.all([
      this.prisma.audit_logs.count({ where }),
      this.prisma.audit_logs.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          users: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    // Format response
    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      tableName: log.table_name,
      recordId: log.record_id,
      oldValues: log.old_values,
      newValues: log.new_values,
      user: log.users
        ? {
            id: log.users.id,
            email: log.users.email,
            role: log.users.role,
          }
        : null,
      userId: log.user_id,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      createdAt: log.created_at,
    }));

    const pagination = calculatePaginationMeta(total, page, limit);

    return {
      items: formattedLogs,
      pagination,
    };
  }

  /**
   * Get audit log by ID
   * Admin only
   */
  async getAuditLogById(id: string) {
    const log = await this.prisma.audit_logs.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!log) {
      return null;
    }

    return {
      id: log.id,
      action: log.action,
      tableName: log.table_name,
      recordId: log.record_id,
      oldValues: log.old_values,
      newValues: log.new_values,
      user: log.users
        ? {
            id: log.users.id,
            email: log.users.email,
            role: log.users.role,
          }
        : null,
      userId: log.user_id,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      createdAt: log.created_at,
    };
  }

  /**
   * Get audit statistics for dashboard
   * Admin only
   */
  async getAuditStatistics(startDate?: Date, endDate?: Date) {
    const where: Prisma.audit_logsWhereInput = {};

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) {
        where.created_at.gte = startDate;
      }
      if (endDate) {
        where.created_at.lte = endDate;
      }
    }

    const [total, byAction, byTable, recentActivity] = await Promise.all([
      this.prisma.audit_logs.count({ where }),
      this.prisma.audit_logs.groupBy({
        by: ['action'],
        where,
        _count: {
          action: true,
        },
        orderBy: {
          _count: {
            action: 'desc',
          },
        },
        take: 10,
      }),
      this.prisma.audit_logs.groupBy({
        by: ['table_name'],
        where,
        _count: {
          table_name: true,
        },
        orderBy: {
          _count: {
            table_name: 'desc',
          },
        },
        take: 10,
      }),
      this.prisma.audit_logs.findMany({
        where,
        take: 5,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      byAction: byAction.map((item) => ({
        action: item.action,
        count: item._count.action,
      })),
      byTable: byTable
        .filter((item) => item.table_name)
        .map((item) => ({
          tableName: item.table_name,
          count: item._count.table_name,
        })),
      recentActivity: recentActivity.map((log) => ({
        id: log.id,
        action: log.action,
        tableName: log.table_name,
        user: log.users
          ? {
              id: log.users.id,
              email: log.users.email,
              role: log.users.role,
            }
          : null,
        createdAt: log.created_at,
      })),
    };
  }
}

