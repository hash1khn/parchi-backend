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
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { ApproveRejectStudentDto } from './dto/approve-reject-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { QueryPendingStudentsDto } from './dto/query-pending-students.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '../../types/global.types';
import { Audit } from '../../decorators/audit.decorator';
import {
  createApiResponse,
  createPaginatedResponse,
} from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('admin/students')
export class AdminStudentsController {
  constructor(private readonly studentsService: StudentsService) { }

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getPendingApprovalStudents(
    @Query() queryDto: QueryPendingStudentsDto,
  ) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 12;
    const result = await this.studentsService.getPendingApprovalStudents(page, limit);
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.STUDENT.LIST_SUCCESS,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllStudents(
    @Query() queryDto: QueryStudentsDto,
  ) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 12;
    const result = await this.studentsService.getAllStudents(queryDto.status, page, limit);
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.STUDENT.LIST_SUCCESS,
    );
  }

  @Get('by-parchi/:parchiId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getStudentByParchiId(
    @Param('parchiId') parchiId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    const data = await this.studentsService.getStudentByParchiId(parchiId, currentUser);
    return createApiResponse(data, API_RESPONSE_MESSAGES.STUDENT.GET_SUCCESS);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getStudentDetailsForReview(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.studentsService.getStudentDetailsForReview(id);
    return createApiResponse(data, API_RESPONSE_MESSAGES.STUDENT.GET_SUCCESS);
  }

  @Put(':id/approve-reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'APPROVE_REJECT_STUDENT', tableName: 'students', recordIdParam: 'id' })
  async approveRejectStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveRejectDto: ApproveRejectStudentDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    const data = await this.studentsService.approveRejectStudent(
      id,
      approveRejectDto,
      user.id,
    );
    return createApiResponse(
      data,
      approveRejectDto.action === 'approve'
        ? API_RESPONSE_MESSAGES.STUDENT.APPROVE_SUCCESS
        : API_RESPONSE_MESSAGES.STUDENT.REJECT_SUCCESS,
    );
  }
}

