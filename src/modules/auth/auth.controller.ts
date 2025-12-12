import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Request,
  Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { StudentSignupDto } from './dto/student-signup.dto';
import { CorporateSignupDto } from './dto/corporate-signup.dto';
import { BranchSignupDto } from './dto/branch-signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';
import { UpdateProfilePictureDto } from './dto/update-profile-picture.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Post('student/signup')
  @HttpCode(HttpStatus.CREATED)
  async studentSignup(@Body() studentSignupDto: StudentSignupDto) {
    return this.authService.studentSignup(studentSignupDto);
  }

  @Post('corporate/signup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async corporateSignup(@Body() corporateSignupDto: CorporateSignupDto) {
    return this.authService.corporateSignup(corporateSignupDto);
  }

  @Post('branch/signup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.CREATED)
  async branchSignup(
    @Body() branchSignupDto: BranchSignupDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.authService.branchSignup(branchSignupDto, currentUser);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() currentUser: any,
    @Request() req,
  ) {
    const token = this.extractTokenFromHeader(req);
    return this.authService.changePassword(
      changePasswordDto,
      token,
      currentUser.id,
    );
  }

  @Patch('student/profile-picture')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async updateProfilePicture(
    @Body() dto: UpdateProfilePictureDto,
    @CurrentUser() user: any,
  ) {
    return this.authService.updateStudentProfilePicture(user.id, dto.imageUrl);
  }


  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req) {
    const token = this.extractTokenFromHeader(req);
    return this.authService.logout(token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser() user) {
    return createApiResponse(user, 'Profile retrieved successfully');
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async adminOnly(@CurrentUser() user) {
    return createApiResponse(
      { message: 'This is an admin-only endpoint', user },
      'Admin access granted',
    );
  }

  @Get('merchant-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE, ROLES.MERCHANT_BRANCH)
  @HttpCode(HttpStatus.OK)
  async merchantOnly(@CurrentUser() user) {
    return createApiResponse(
      { message: 'This is a merchant-only endpoint', user },
      'Merchant access granted',
    );
  }

  @Get('student-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  async studentOnly(@CurrentUser() user) {
    return createApiResponse(
      { message: 'This is a student-only endpoint', user },
      'Student access granted',
    );
  }

  private extractTokenFromHeader(request: any): string {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return '';
    }

    const [type, token] = authHeader.split(' ') ?? [];
    return type === 'Bearer' ? token : '';
  }
}
