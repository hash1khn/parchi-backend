import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { QueryLeaderboardDto } from './dto/query-leaderboard.dto';
import {
  createPaginatedResponse,
} from '../../utils/serializer.util';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('leaderboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async getLeaderboard(
    @Query() queryDto: QueryLeaderboardDto,
  ) {
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 10;

    const result = await this.studentsService.getLeaderboard(page, limit);
    return createPaginatedResponse(
      result.items,
      result.pagination,
      API_RESPONSE_MESSAGES.STUDENT.LEADERBOARD_SUCCESS,
    );
  }
}

