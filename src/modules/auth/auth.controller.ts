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
  UnauthorizedException,
  BadRequestException,
  Param,
  UploadedFiles,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { extname } from 'path';
import { MulterExceptionFilter } from '../../common/filters/multer-exception.filter';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { StudentSignupDto } from './dto/student-signup.dto';
import { CorporateSignupDto } from './dto/corporate-signup.dto';
import { BranchSignupDto } from './dto/branch-signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { StudentSignupWithFilesDto } from './dto/student-signup-with-files.dto';
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
  constructor(private readonly authService: AuthService) { }

  // ── Strict rate-limits on unauthenticated / credential endpoints ──────────
  // 10 attempts per 60 seconds per IP — blocks brute-force and enumeration.

  @Post('signup')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() signupDto: SignupDto) {
    const data = await this.authService.signup(signupDto);
    return createApiResponse(data, API_RESPONSE_MESSAGES.AUTH.SIGNUP_SUCCESS, HttpStatus.CREATED);
  }

  @Post('student/signup')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  async studentSignup(@Body() studentSignupDto: StudentSignupDto) {
    const data = await this.authService.studentSignup(studentSignupDto);
    return createApiResponse(data, API_RESPONSE_MESSAGES.AUTH.STUDENT_SIGNUP_SUCCESS, HttpStatus.CREATED);
  }

  // Friendly business limit enforced manually (see validateKycFile) — the
  // interceptor's limit below is just a hard ceiling so a runaway upload
  // can't be buffered into memory before we get a chance to reject it nicely.
  private static readonly ALLOWED_KYC_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];
  private static readonly ALLOWED_KYC_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.heic',
    '.heif',
  ];
  private static readonly MAX_KYC_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  @Post('student/signup-with-files')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'studentIdCardFront', maxCount: 1 },
        { name: 'studentIdCardBack', maxCount: 1 },
        { name: 'selfieImage', maxCount: 1 },
      ],
      { limits: { fileSize: 12 * 1024 * 1024 } },
    ),
  )
  @HttpCode(HttpStatus.CREATED)
  async studentSignupWithFiles(
    @Body() signupDto: StudentSignupWithFilesDto,
    @UploadedFiles()
    files: {
      studentIdCardFront?: any[];
      studentIdCardBack?: any[];
      selfieImage?: any[];
    },
  ) {
    const studentIdCardFront = files?.studentIdCardFront?.[0];
    const studentIdCardBack = files?.studentIdCardBack?.[0];
    const selfieImage = files?.selfieImage?.[0];

    if (
      !studentIdCardFront ||
      !studentIdCardBack ||
      !selfieImage
    ) {
      throw new BadRequestException(
        'Please upload your student ID (front and back) and a selfie to continue.',
      );
    }

    this.validateKycFile(studentIdCardFront, 'Student ID card (front)');
    this.validateKycFile(studentIdCardBack, 'Student ID card (back)');
    this.validateKycFile(selfieImage, 'Selfie photo');

    const data = await this.authService.studentSignupWithFiles(signupDto, {
      studentIdCardFront,
      studentIdCardBack,
      selfieImage,
    });
    return createApiResponse(
      data,
      API_RESPONSE_MESSAGES.AUTH.STUDENT_SIGNUP_SUCCESS,
      HttpStatus.CREATED,
    );
  }

  private validateKycFile(file: any, label: string): void {
    // Mobile upload clients (e.g. Dart's http.MultipartFile.fromPath without an
    // explicit contentType) often send a generic "application/octet-stream"
    // content-type instead of the real image MIME type, even for a valid
    // JPG/PNG/WEBP file. Trusting the MIME type alone then rejects every
    // upload from those clients, so fall back to the file extension before
    // rejecting — only reject if BOTH checks fail.
    const hasAllowedMimeType = AuthController.ALLOWED_KYC_MIME_TYPES.includes(file.mimetype);
    const hasAllowedExtension = AuthController.ALLOWED_KYC_EXTENSIONS.includes(
      extname(file.originalname || '').toLowerCase(),
    );
    if (!hasAllowedMimeType && !hasAllowedExtension) {
      throw new BadRequestException(`${label} must be a JPG, PNG, or WEBP image.`);
    }
    if (file.size > AuthController.MAX_KYC_FILE_SIZE_BYTES) {
      throw new BadRequestException(`${label} must be smaller than 10MB.`);
    }
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
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return createApiResponse(data, API_RESPONSE_MESSAGES.AUTH.LOGIN_SUCCESS);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
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
    getRecordId: (args) => args[3]?.user?.id
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
    getRecordId: (args) => args[3]?.user?.id
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
  async logout(@Request() req, @CurrentUser() user: any, @Body() body?: { fcmToken?: string }) {
    const token = this.extractTokenFromHeader(req);
    await this.authService.logout(token, user.id, body?.fcmToken);
    return createApiResponse(null, API_RESPONSE_MESSAGES.AUTH.LOGOUT_SUCCESS);
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    const data = await this.authService.refreshSession(refreshToken);
    return createApiResponse(data, 'Session refreshed successfully');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle() // authenticated + read-only; no abuse risk
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser() user) {
    const userWithDetails = await this.authService.getCurrentUserWithDetails(user.id);

    if (!userWithDetails) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return createApiResponse(userWithDetails, 'Profile retrieved successfully');
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
    if (!authHeader) return '';
    const [type, token] = authHeader.split(' ') ?? [];
    return type === 'Bearer' ? token : '';
  }

  @Post('admin/reset-password/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'ADMIN_RESET_PASSWORD',
    tableName: 'users',
    recordIdParam: 'userId'
  })
  async adminResetPassword(
    @Param('userId') userId: string,
    @Body() resetPasswordDto: AdminResetPasswordDto,
    @CurrentUser() currentUser: any,
  ) {
    await this.authService.adminResetPassword(userId, resetPasswordDto.newPassword);
    return createApiResponse(null, 'Password reset successfully');
  }

  @Patch('update-fcm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateFcmToken(
    @CurrentUser() user: any,
    @Body() body: { token: string; platform?: string },
  ) {
    if (!body.token) {
      throw new BadRequestException('Token is required');
    }
    const data = await this.authService.updateFcmToken(user.id, body.token, body.platform);
    return createApiResponse(data, 'FCM token updated successfully');
  }
}
