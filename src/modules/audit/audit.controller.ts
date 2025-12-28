import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAuditLogs(@Query() queryDto: QueryAuditLogsDto) {
    const result = await this.auditService.getAuditLogs(queryDto);
    return createPaginatedResponse(
      result.items,
      result.pagination,
      'Audit logs retrieved successfully',
    );
  }

  @Get('statistics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAuditStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const statistics = await this.auditService.getAuditStatistics(start, end);
    return createApiResponse(
      statistics,
      'Audit statistics retrieved successfully',
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAuditLogById(@Param('id', ParseUUIDPipe) id: string) {
    const log = await this.auditService.getAuditLogById(id);
    if (!log) {
      return createApiResponse(
        null,
        API_RESPONSE_MESSAGES.COMMON.NOT_FOUND || 'Audit log not found',
        404,
      );
    }
    return createApiResponse(log, 'Audit log retrieved successfully');
  }
}

