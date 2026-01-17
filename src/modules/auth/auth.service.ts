import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { StudentSignupDto } from './dto/student-signup.dto';
import { CorporateSignupDto } from './dto/corporate-signup.dto';
import { BranchSignupDto } from './dto/branch-signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { ROLES, UserRole } from '../../constants/app.constants';
import { JwtPayload } from '../../types/global.types';
import { generateParchiId } from '../../utils/parchi-id.util';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;
  private adminSupabase: SupabaseClient;
  private jwtSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.jwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET') || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration is missing');
    }

    if (!this.jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET is required for JWT verification');
    }

    this.supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Create admin client with service role key for admin operations
    if (supabaseServiceKey) {
      this.adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    }
  }

  async signup(signupDto: SignupDto): Promise<{ user: any; session: any }> {
    try {
      // Validate role
      this.validateRole(signupDto.role);

      // Check if user already exists in public.users
      const existingUser = await this.prisma.public_users.findUnique({
        where: { email: signupDto.email },
      });

      if (existingUser) {
        throw new ConflictException(API_RESPONSE_MESSAGES.AUTH.USER_ALREADY_EXISTS);
      }

      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email: signupDto.email,
        password: signupDto.password,
        options: {
          data: {
            role: signupDto.role,
            phone: signupDto.phone || null,
          },
        },
      });

      if (authError) {
        throw new BadRequestException(authError.message);
      }

      if (!authData.user) {
        throw new BadRequestException('Failed to create user');
      }

      // Determine initial is_active status based on role
      // Students and merchants need admin approval, admins are auto-approved
      const isActive = signupDto.role === ROLES.ADMIN;

      // Create user in public.users table
      const publicUser = await this.prisma.public_users.create({
        data: {
          id: authData.user.id,
          email: signupDto.email,
          phone: signupDto.phone || null,
          role: signupDto.role,
          is_active: isActive,
        },
      });

      return {
        user: {
          id: publicUser.id,
          email: publicUser.email,
          role: publicUser.role,
          is_active: publicUser.is_active,
        },
        session: authData.session,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Signup failed');
    }
  }

  private validateRole(role: UserRole): void {
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
  }

  async login(loginDto: LoginDto): Promise<{ user: any; session: any }> {
    try {
      // Authenticate with Supabase
      const { data: authData, error: authError } =
        await this.supabase.auth.signInWithPassword({
          email: loginDto.email,
          password: loginDto.password,
        });

      if (authError || !authData.user) {
        throw new UnauthorizedException(
          API_RESPONSE_MESSAGES.AUTH.INVALID_CREDENTIALS,
        );
      }

      // Get user from public.users
      const publicUser = await this.prisma.public_users.findUnique({
        where: { id: authData.user.id },
      });

      if (!publicUser) {
        throw new UnauthorizedException(
          API_RESPONSE_MESSAGES.AUTH.INVALID_CREDENTIALS,
        );
      }

      // Check if account is active
      if (!publicUser.is_active) {
        // Check specifically for students who are rejected
        if (publicUser.role === ROLES.STUDENT) {
          const student = await this.prisma.students.findUnique({
            where: { user_id: publicUser.id },
            include: {
              student_kyc: {
                orderBy: { submitted_at: 'desc' },
                take: 1
              }
            }
          });

          if (student && student.verification_status === 'rejected') {
            const reason = student.student_kyc[0]?.review_notes || 'No reason provided';
            throw new ForbiddenException(`Your account has been rejected. Reason: ${reason}`);
          }
        }

        throw new UnauthorizedException(
          API_RESPONSE_MESSAGES.AUTH.ACCOUNT_PENDING,
        );
      }

      return {
        user: {
          id: publicUser.id,
          email: publicUser.email,
          role: publicUser.role,
          is_active: publicUser.is_active,
        },
        session: authData.session,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new UnauthorizedException(
        API_RESPONSE_MESSAGES.AUTH.INVALID_CREDENTIALS,
      );
    }
  }

  async validateUser(token: string): Promise<any> {
    try {
      // Set the session with the token
      const { data: { user }, error } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        return null;
      }

      const publicUser = await this.prisma.public_users.findUnique({
        where: { id: user.id },
      });

      if (!publicUser || !publicUser.is_active) {
        return null;
      }

      return {
        id: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
      };
    } catch (error) {
      return null;
    }
  }

  // --- UPDATED METHOD ---
  async validateUserFromSession(accessToken: string): Promise<any> {
    try {
      // Verify JWT token using SUPABASE_JWT_SECRET
      let decoded: JwtPayload;
      try {
        decoded = jwt.verify(accessToken, this.jwtSecret) as JwtPayload;
      } catch (error) {
        // Token is invalid or expired
        return null;
      }

      // Get user from public.users table using the user ID from the token
      const publicUser = await this.prisma.public_users.findUnique({
        where: { id: decoded.sub },
      });

      if (!publicUser || !publicUser.is_active) {
        return null;
      }

      // Fetch role-specific details based on user role
      let studentDetails: any = null;
      let merchantDetails: any = null;
      let branchDetails: any = null;

      if (publicUser.role === ROLES.STUDENT) {
        studentDetails = await this.prisma.students.findUnique({
          where: { user_id: publicUser.id },
          select: {
            first_name: true,
            last_name: true,
            parchi_id: true,
            university: true,
            profile_picture: true, // [ADD THIS LINE]
          },
        });
      } else if (publicUser.role === ROLES.MERCHANT_CORPORATE) {
        merchantDetails = await this.prisma.merchants.findUnique({
          where: { user_id: publicUser.id },
          select: {
            id: true,
            business_name: true,
            email_prefix: true,
            category: true,
          },
        });
      } else if (publicUser.role === ROLES.MERCHANT_BRANCH) {
        branchDetails = await this.prisma.merchant_branches.findUnique({
          where: { user_id: publicUser.id },
          select: {
            id: true,
            branch_name: true,
            merchant_id: true,
            city: true,
          },
        });
      }

      return {
        id: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
        is_active: publicUser.is_active,
        // Attach role-specific details to the user object
        student: studentDetails,
        merchant: merchantDetails,
        branch: branchDetails,
      };
    } catch (error) {
      return null;
    }
  }
  // --- UPDATED METHOD END ---

  async logout(accessToken: string): Promise<null> {
    try {
      // Create a client with the user's token to sign them out
      const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
      const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new BadRequestException('Supabase configuration is missing');
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      });

      const { error } = await userClient.auth.signOut();

      if (error) {
        throw new BadRequestException(error.message);
      }

      return null;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Logout failed');
    }
  }

  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }

  getAdminSupabaseClient(): SupabaseClient {
    if (!this.adminSupabase) {
      throw new Error('Admin Supabase client not initialized. SUPABASE_SERVICE_ROLE_KEY is required.');
    }
    return this.adminSupabase;
  }

  async studentSignup(
    signupDto: StudentSignupDto,
  ): Promise<any> {
    try {
      // 1. Check if email already exists
      const existingUser = await this.prisma.public_users.findUnique({
        where: { email: signupDto.email },
      });

      if (existingUser) {
        throw new ConflictException(
          API_RESPONSE_MESSAGES.AUTH.STUDENT_SIGNUP_EMAIL_EXISTS,
        );
      }

      // 2. Validate image URLs format
      const urlPattern = /^https?:\/\/.+/;
      if (
        !urlPattern.test(signupDto.studentIdCardFrontUrl) ||
        !urlPattern.test(signupDto.studentIdCardBackUrl) ||
        !urlPattern.test(signupDto.selfieImageUrl)
      ) {
        throw new UnprocessableEntityException(
          API_RESPONSE_MESSAGES.AUTH.STUDENT_SIGNUP_INVALID_IMAGES,
        );
      }

      // 3. Create user in Supabase Auth
      const { data: authData, error: authError } =
        await this.supabase.auth.signUp({
          email: signupDto.email,
          password: signupDto.password,
          options: {
            data: {
              role: ROLES.STUDENT,
              phone: signupDto.phone || null,
              first_name: signupDto.firstName,
            },
            emailRedirectTo: undefined,
          },
        });

      if (authError || !authData.user) {
        throw new BadRequestException(
          authError?.message || 'Failed to create user account',
        );
      }

      const userId = authData.user.id;

      // 5. Generate unique Parchi ID
      const parchiId = await generateParchiId(this.prisma);

      // 6. Transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const publicUser = await tx.public_users.create({
          data: {
            id: userId,
            email: signupDto.email,
            phone: signupDto.phone || null,
            role: ROLES.STUDENT,
            is_active: false,
          },
        });

        const student = await tx.students.create({
          data: {
            user_id: publicUser.id,
            parchi_id: parchiId,
            first_name: signupDto.firstName,
            last_name: signupDto.lastName,
            university: signupDto.university,
            verification_status: 'pending',
          },
        });

        const studentKyc = await tx.student_kyc.create({
          data: {
            student_id: student.id,
            student_id_card_front_path: signupDto.studentIdCardFrontUrl,
            student_id_card_back_path: signupDto.studentIdCardBackUrl,
            selfie_image_path: signupDto.selfieImageUrl,
          },
        });

        return {
          user: publicUser,
          student,
          studentKyc,
        };
      });

      return {
        id: result.student.id,
        email: result.user.email,
        firstName: result.student.first_name,
        lastName: result.student.last_name,
        university: result.student.university,
        parchiId: result.student.parchi_id,
        verificationStatus: result.student.verification_status,
        createdAt: result.student.created_at,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Student signup failed',
      );
    }
  }

  async corporateSignup(
    signupDto: CorporateSignupDto,
  ): Promise<any> {
    try {
      // 1. Check if email already exists
      const existingUser = await this.prisma.public_users.findUnique({
        where: { email: signupDto.email },
      });

      if (existingUser) {
        throw new ConflictException(
          API_RESPONSE_MESSAGES.AUTH.CORPORATE_SIGNUP_EMAIL_EXISTS,
        );
      }

      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(signupDto.logo_path)) {
        throw new UnprocessableEntityException(
          API_RESPONSE_MESSAGES.AUTH.CORPORATE_SIGNUP_INVALID_LOGO,
        );
      }

      const { data: authData, error: authError } =
        await this.adminSupabase.auth.admin.createUser({
          email: signupDto.email,
          password: signupDto.password,
          email_confirm: true,
          user_metadata: {
            role: ROLES.MERCHANT_CORPORATE,
            phone: signupDto.contact || null,
          }
        });

      if (authError || !authData.user) {
        throw new BadRequestException(
          authError?.message || 'Failed to create user account',
        );
      }

      const userId = authData.user.id;

      const result = await this.prisma.$transaction(async (tx) => {
        const publicUser = await tx.public_users.create({
          data: {
            id: userId,
            email: signupDto.email,
            phone: signupDto.contact || null,
            role: ROLES.MERCHANT_CORPORATE,
            is_active: true,
          },
        });

        const merchant = await tx.merchants.create({
          data: {
            user_id: publicUser.id,
            business_name: signupDto.name,
            business_registration_number: signupDto.regNumber || null,
            email_prefix: signupDto.emailPrefix,
            contact_email: signupDto.contactEmail,
            contact_phone: signupDto.contact,
            logo_path: signupDto.logo_path,
            category: signupDto.category || null,
            verification_status: 'approved',
          },
        });

        return {
          user: publicUser,
          merchant,
        };
      });

      return {
        id: result.merchant.id,
        email: result.user.email,
        businessName: result.merchant.business_name,
        emailPrefix: result.merchant.email_prefix,
        contactEmail: result.merchant.contact_email,
        category: result.merchant.category,
        verificationStatus: result.merchant.verification_status,
        createdAt: result.merchant.created_at,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Corporate signup failed',
      );
    }
  }

  /**
   * Branch signup - Creates branch merchant account
   * Creates user in Supabase Auth, public.users, and merchant_branches tables
   * This endpoint can be called by admin or corporate merchant to create branch accounts
   * If admin creates: account is active immediately (no verification needed)
   * If corporate merchant creates: account is pending verification
   */
  async branchSignup(
    signupDto: BranchSignupDto,
    currentUser: any,
  ): Promise<any> {
    try {
      // 1. Check if email already exists
      const existingUser = await this.prisma.public_users.findUnique({
        where: { email: signupDto.email },
      });

      if (existingUser) {
        throw new ConflictException(
          API_RESPONSE_MESSAGES.AUTH.BRANCH_SIGNUP_EMAIL_EXISTS,
        );
      }

      // 2. Determine merchant_id based on user role
      let merchantId: string;

      if (currentUser?.role === ROLES.MERCHANT_CORPORATE) {
        // Corporate merchant: Get their own merchant_id from database
        const corporateMerchant = await this.prisma.merchants.findUnique({
          where: { user_id: currentUser.id },
        });

        if (!corporateMerchant) {
          throw new BadRequestException(
            'Corporate merchant account not found. Please contact support.',
          );
        }

        merchantId = corporateMerchant.id;
      } else if (currentUser?.role === ROLES.ADMIN) {
        // Admin: Must provide linkedCorporate in request
        if (!signupDto.linkedCorporate) {
          throw new BadRequestException(
            'linkedCorporate is required when creating branch as admin',
          );
        }

        // Verify the corporate account exists
        const corporateAccount = await this.prisma.merchants.findUnique({
          where: { id: signupDto.linkedCorporate },
        });

        if (!corporateAccount) {
          throw new BadRequestException(
            API_RESPONSE_MESSAGES.AUTH.BRANCH_SIGNUP_INVALID_CORPORATE,
          );
        }

        merchantId = signupDto.linkedCorporate;
      } else {
        throw new BadRequestException('Invalid user role for branch creation');
      }

      // 3. Create user in Supabase Auth with password from frontend
      const { data: authData, error: authError } =
        await this.adminSupabase.auth.admin.createUser({
          email: signupDto.email,
          password: signupDto.password,
          email_confirm: true,
          user_metadata: {
            role: ROLES.MERCHANT_BRANCH,
            phone: signupDto.contact || null,
          }
        });

      if (authError || !authData.user) {
        throw new BadRequestException(
          authError?.message || 'Failed to create user account',
        );
      }

      // Store user ID since TypeScript needs this for type narrowing
      const userId = authData.user.id;

      // 4. Convert latitude/longitude from string to Decimal if provided
      const latitude = signupDto.latitude
        ? parseFloat(signupDto.latitude)
        : null;
      const longitude = signupDto.longitude
        ? parseFloat(signupDto.longitude)
        : null;

      // Validate coordinates if provided
      if (latitude !== null && (isNaN(latitude) || latitude < -90 || latitude > 90)) {
        throw new BadRequestException('Invalid latitude value');
      }
      if (longitude !== null && (isNaN(longitude) || longitude < -180 || longitude > 180)) {
        throw new BadRequestException('Invalid longitude value');
      }

      // Determine if account should be active based on creator's role
      // Admin creates: active immediately (no verification needed)
      // Corporate merchant creates: inactive (pending verification)
      const isActive = currentUser?.role === ROLES.ADMIN;

      // 5. Use transaction to create all related records atomically
      const result = await this.prisma.$transaction(async (tx) => {
        // Create public.users record
        const publicUser = await tx.public_users.create({
          data: {
            id: userId,
            email: signupDto.email,
            phone: signupDto.contact || null,
            role: ROLES.MERCHANT_BRANCH,
            is_active: isActive,
          },
        });

        // Create merchant_branches record
        const branch = await tx.merchant_branches.create({
          data: {
            merchant_id: merchantId,
            user_id: publicUser.id,
            branch_name: signupDto.name,
            address: signupDto.address,
            city: signupDto.city,
            contact_phone: signupDto.contact || null,
            latitude: latitude !== null ? latitude : undefined,
            longitude: longitude !== null ? longitude : undefined,
            is_active: isActive,
          },
        });

        return {
          user: publicUser,
          branch,
        };
      });

      // 6. Return response (without sensitive data)
      return {
        id: result.branch.id,
        email: result.user.email,
        branchName: result.branch.branch_name,
        address: result.branch.address,
        city: result.branch.city,
        contactPhone: result.branch.contact_phone,
        latitude: result.branch.latitude?.toString() || null,
        longitude: result.branch.longitude?.toString() || null,
        linkedCorporate: merchantId,
        isActive: result.user.is_active,
        createdAt: result.branch.created_at,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Branch signup failed',
      );
    }
  }

  /**
   * Forgot Password - Sends password reset email via Supabase
   * This will send an email to the user with a password reset link
   */
  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<null> {
    try {
      // Check if user exists in public.users
      const publicUser = await this.prisma.public_users.findUnique({
        where: { email: forgotPasswordDto.email },
      });

      if (!publicUser) {
        // Don't reveal if user exists or not for security reasons
        // Return null even if user doesn't exist
        return null;
      }

      // Use Supabase to send password reset email
      const { error } = await this.supabase.auth.resetPasswordForEmail(
        forgotPasswordDto.email,
        {
          redirectTo: this.configService.get<string>('PASSWORD_RESET_REDIRECT_URL') || undefined,
        },
      );

      if (error) {
        throw new BadRequestException(error.message);
      }

      return null;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Failed to send password reset email',
      );
    }
  }

  /**
   * Update Student Profile Picture
   * Stores the Supabase Storage URL in the database
   */
  async updateStudentProfilePicture(
    userId: string,
    imageUrl: string,
  ): Promise<any> {
    try {
      // 1. Verify user is a student
      const student = await this.prisma.students.findUnique({
        where: { user_id: userId },
      });

      if (!student) {
        throw new BadRequestException('Student profile not found');
      }

      // 2. Update database
      const updatedStudent = await this.prisma.students.update({
        where: { user_id: userId },
        data: {
          profile_picture: imageUrl,
        },
      });

      return { profilePicture: updatedStudent.profile_picture };
    } catch (error) {
      throw new BadRequestException('Failed to update profile picture');
    }
  }


  /**
   * Change Password - Changes password for authenticated user
   * Requires current password verification and user's access token
   * 
   * Implements the password change logic directly using SQL queries:
   * 1. Verifies the current password by checking it against the encrypted password in auth.users
   * 2. Updates the password if verification succeeds
   * 3. Returns error if password is wrong
   * 
   * This approach:
   * - Doesn't create unnecessary sessions
   * - Performs verification and update in database operations
   * - Uses the existing authenticated session (via access token)
   * - Directly queries the auth.users table using raw SQL
   */
  async changePassword(
    changePasswordDto: ChangePasswordDto,
    accessToken: string,
    userId: string,
  ): Promise<null> {
    try {
      // Step 1: Verify current password by checking if it matches the encrypted password
      // We query auth.users table directly using raw SQL with parameterized queries for security
      // Prisma automatically handles parameterization to prevent SQL injection
      const verifyResult = await this.prisma.$queryRaw<Array<{ encrypted_password: string }>>`
        SELECT encrypted_password
        FROM auth.users
        WHERE id = ${userId}::uuid
          AND encrypted_password = crypt(${changePasswordDto.currentPassword}, encrypted_password)
      `;

      // If no matching password found, current password is incorrect
      if (!verifyResult || verifyResult.length === 0) {
        throw new UnauthorizedException(
          API_RESPONSE_MESSAGES.AUTH.CHANGE_PASSWORD_INVALID_CURRENT,
        );
      }

      // Step 2: Update password with new encrypted password
      // Generate new salt and encrypt the new password
      await this.prisma.$executeRaw`
        UPDATE auth.users 
        SET encrypted_password = crypt(${changePasswordDto.newPassword}, gen_salt('bf')) 
        WHERE id = ${userId}::uuid
      `;

      return null;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        error.message || API_RESPONSE_MESSAGES.AUTH.CHANGE_PASSWORD_FAILED,
      );
    }
  }
}

