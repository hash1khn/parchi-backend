import {
  Controller,
  Get,
  Patch,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentsService } from './students.service';
import { QueryLeaderboardDto } from './dto/query-leaderboard.dto';
import { createPaginatedResponse, createApiResponse } from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('leaderboard')
  @HttpCode(HttpStatus.OK)
  async getLeaderboard(
    @Query() queryDto: QueryLeaderboardDto,
  ) {
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 10;

    const result = await this.studentsService.getLeaderboard(
      page,
      limit,
      queryDto.period || 'alltime',
    );
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.STUDENT.LEADERBOARD_SUCCESS,
    );
  }

  @Patch('app-intro')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async markAppIntroSeen(@CurrentUser() user: any) {
    await this.studentsService.markAppIntroSeen(user.id);
    return createApiResponse(null, 'App intro marked as seen');
  }

  @Post('selfie-change-request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async submitSelfieChangeRequest(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Selfie image file is required');
    }
    const data = await this.studentsService.submitSelfieChangeRequest(user.id, {
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
    return createApiResponse(data, 'Selfie change request submitted successfully');
  }

  @Get('selfie-change-request/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getSelfieChangeRequestStatus(@CurrentUser() user: any) {
    const data = await this.studentsService.getSelfieChangeRequestStatus(user.id);
    return createApiResponse(data, 'Selfie change request status fetched');
  }
}

