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

@Controller('admin/students')
export class AdminStudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getPendingApprovalStudents(
    @Query() queryDto: QueryPendingStudentsDto,
  ) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    return this.studentsService.getPendingApprovalStudents(page, limit);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllStudents(
    @Query() queryDto: QueryStudentsDto,
  ) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 10;
    return this.studentsService.getAllStudents(queryDto.status, page, limit);
  }

  @Get('by-parchi/:parchiId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async getStudentByParchiId(
    @Param('parchiId') parchiId: string,
    @CurrentUser() currentUser: ICurrentUser,
  ) {
    return this.studentsService.getStudentByParchiId(parchiId, currentUser);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getStudentDetailsForReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentsService.getStudentDetailsForReview(id);
  }

  @Put(':id/approve-reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approveRejectStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() approveRejectDto: ApproveRejectStudentDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.studentsService.approveRejectStudent(
      id,
      approveRejectDto,
      user.id,
    );
  }
}

