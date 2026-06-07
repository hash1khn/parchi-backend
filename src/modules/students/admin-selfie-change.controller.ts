import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { ResolveSelfieChangeDto } from './dto/resolve-selfie-change.dto';
import { Audit } from '../../decorators/audit.decorator';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('admin/selfie-change-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class AdminSelfieChangeController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listRequests(@Query('status') status: string = 'pending') {
    const data = await this.studentsService.getSelfieChangeRequests(status);
    return createApiResponse(data, 'Selfie change requests fetched successfully');
  }

  @Put(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'RESOLVE_SELFIE_CHANGE', tableName: 'selfie_change_requests', recordIdParam: 'id' })
  async resolveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSelfieChangeDto,
  ) {
    const data = await this.studentsService.resolveSelfieChangeRequest(
      id,
      dto.action,
      dto.adminNote,
    );
    return createApiResponse(
      data,
      dto.action === 'approve'
        ? 'Selfie change request approved'
        : 'Selfie change request rejected',
    );
  }
}
