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
  DefaultValuePipe,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { ApproveRejectStudentDto } from './dto/approve-reject-student.dto';
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.studentsService.getPendingApprovalStudents(page, limit);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllStudents(
    @Query('status') status?: 'pending' | 'approved' | 'rejected' | 'expired',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.studentsService.getAllStudents(status, page, limit);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getStudentDetailsForReview(@Param('id') id: string) {
    return this.studentsService.getStudentDetailsForReview(id);
  }

  @Put(':id/approve-reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approveRejectStudent(
    @Param('id') id: string,
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

