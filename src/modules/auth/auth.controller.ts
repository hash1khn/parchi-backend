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
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { UpdateProfilePictureDto } from './dto/update-profile-picture.dto';
import { Audit } from '../../decorators/audit.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signupDto: SignupDto) {
    const data = await this.authService.signup(signupDto);
    return createApiResponse(data, API_RESPONSE_MESSAGES.AUTH.SIGNUP_SUCCESS, HttpStatus.CREATED);
  }

  @Post('student/signup')
  @HttpCode(HttpStatus.CREATED)
  async studentSignup(@Body() studentSignupDto: StudentSignupDto) {
    const data = await this.authService.studentSignup(studentSignupDto);
    return createApiResponse(data, API_RESPONSE_MESSAGES.AUTH.STUDENT_SIGNUP_SUCCESS, HttpStatus.CREATED);
  }

  @Post('corporate/signup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'CREATE_CORPORATE_ACCOUNT', tableName: 'merchants' })
  async corporateSignup(@Body() corporateSignupDto: CorporateSignupDto) {
    const data = await this.authService.corporateSignup(corporateSignupDto);
    return createApiResponse(data, API_RESPONSE_MESSAGES.AUTH.CORPORATE_SIGNUP_SUCCESS, HttpStatus.CREATED);
  }

  @Post('branch/signup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'CREATE_BRANCH_ACCOUNT', tableName: 'merchant_branches' })
  async branchSignup(
    @Body() branchSignupDto: BranchSignupDto,
    @CurrentUser() currentUser: any,
  ) {
    const data = await this.authService.branchSignup(branchSignupDto, currentUser);
    const successMessage = data.isActive
      ? API_RESPONSE_MESSAGES.AUTH.BRANCH_SIGNUP_SUCCESS_ADMIN
      : API_RESPONSE_MESSAGES.AUTH.BRANCH_SIGNUP_SUCCESS;
    return createApiResponse(data, successMessage, HttpStatus.CREATED);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return createApiResponse(data, API_RESPONSE_MESSAGES.AUTH.LOGIN_SUCCESS);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.forgotPassword(forgotPasswordDto);
    return createApiResponse(null, API_RESPONSE_MESSAGES.AUTH.FORGOT_PASSWORD_SUCCESS);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Audit({ 
    action: 'CHANGE_PASSWORD', 
    tableName: 'users',
    getRecordId: (args) => args[3]?.user?.id // Extract user ID from request.user
  })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() currentUser: any,
    @Request() req,
  ) {
    const token = this.extractTokenFromHeader(req);
    await this.authService.changePassword(
      changePasswordDto,
      token,
      currentUser.id,
    );
    return createApiResponse(null, API_RESPONSE_MESSAGES.AUTH.CHANGE_PASSWORD_SUCCESS);
  }

  @Patch('student/profile-picture')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  @HttpCode(HttpStatus.OK)
  @Audit({ 
    action: 'UPDATE_PROFILE_PICTURE', 
    tableName: 'students',
    getRecordId: (args) => args[3]?.user?.id // Extract user ID from request.user
  })
  async updateProfilePicture(
    @Body() dto: UpdateProfilePictureDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.authService.updateStudentProfilePicture(user.id, dto.imageUrl);
    return createApiResponse(data, 'Profile picture updated successfully');
  }


  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req) {
    const token = this.extractTokenFromHeader(req);
    await this.authService.logout(token);
    return createApiResponse(null, API_RESPONSE_MESSAGES.AUTH.LOGOUT_SUCCESS);
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
