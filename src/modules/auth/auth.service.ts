import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { StudentSignupDto } from './dto/student-signup.dto';
import { CorporateSignupDto } from './dto/corporate-signup.dto';
import { BranchSignupDto } from './dto/branch-signup.dto';
import { ApiResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { ROLES, UserRole } from '../../constants/app.constants';
import { JwtPayload } from '../../types/global.types';
import { generateParchiId } from '../../utils/parchi-id.util';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;
  private jwtSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    this.jwtSecret = this.configService.get<string>('SUPABASE_JWT_SECRET') || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration is missing');
    }

    if (!this.jwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET is required for JWT verification');
    }

    this.supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  async signup(signupDto: SignupDto): Promise<ApiResponse<{ user: any; session: any }>> {
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
        data: {
          user: {
            id: publicUser.id,
            email: publicUser.email,
            role: publicUser.role,
            is_active: publicUser.is_active,
          },
          session: authData.session,
        },
        status: 201,
        message: API_RESPONSE_MESSAGES.AUTH.SIGNUP_SUCCESS,
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

  async login(loginDto: LoginDto): Promise<ApiResponse<{ user: any; session: any }>> {
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
        throw new UnauthorizedException(
          API_RESPONSE_MESSAGES.AUTH.ACCOUNT_PENDING,
        );
      }

      return {
        data: {
          user: {
            id: publicUser.id,
            email: publicUser.email,
            role: publicUser.role,
            is_active: publicUser.is_active,
          },
          session: authData.session,
        },
        status: 200,
        message: API_RESPONSE_MESSAGES.AUTH.LOGIN_SUCCESS,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
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

      // [LOGIC FIXED] Use 'any' or implicit typing instead of ': null'
      let studentDetails: any = null;
      
      if (publicUser.role === ROLES.STUDENT) {
        studentDetails = await this.prisma.students.findUnique({
          where: { user_id: publicUser.id },
          select: {
            first_name: true,
            last_name: true,
            parchi_id: true,
            university: true,
            // Add any other fields you want available in the user profile
          },
        });
      }

      return {
        id: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
        is_active: publicUser.is_active,
        // [LOGIC ADDED] Attach student details to the user object
        student: studentDetails,
      };
    } catch (error) {
      return null;
    }
  }
  // --- UPDATED METHOD END ---

  async logout(accessToken: string): Promise<ApiResponse<null>> {
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

      return {
        data: null,
        status: 200,
        message: API_RESPONSE_MESSAGES.AUTH.LOGOUT_SUCCESS,
      };
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

  async studentSignup(
    signupDto: StudentSignupDto,
  ): Promise<ApiResponse<any>> {
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
        !urlPattern.test(signupDto.studentIdImageUrl) ||
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
            student_id_image_path: signupDto.studentIdImageUrl,
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
        status: 201,
        message: API_RESPONSE_MESSAGES.AUTH.STUDENT_SIGNUP_SUCCESS,
        data: {
          id: result.student.id,
          email: result.user.email,
          firstName: result.student.first_name,
          lastName: result.student.last_name,
          university: result.student.university,
          parchiId: result.student.parchi_id,
          verificationStatus: result.student.verification_status,
          createdAt: result.student.created_at,
        },
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
  ): Promise<ApiResponse<any>> {
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
        await this.supabase.auth.signUp({
          email: signupDto.email,
          password: signupDto.password,
          options: {
            data: {
              role: ROLES.MERCHANT_CORPORATE,
              phone: signupDto.contact || null,
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
        status: 201,
        message: API_RESPONSE_MESSAGES.AUTH.CORPORATE_SIGNUP_SUCCESS,
        data: {
          id: result.merchant.id,
          email: result.user.email,
          businessName: result.merchant.business_name,
          emailPrefix: result.merchant.email_prefix,
          contactEmail: result.merchant.contact_email,
          category: result.merchant.category,
          verificationStatus: result.merchant.verification_status,
          createdAt: result.merchant.created_at,
        },
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
  ): Promise<ApiResponse<any>> {
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
        await this.supabase.auth.signUp({
          email: signupDto.email,
          password: signupDto.password,
          options: {
            data: {
              role: ROLES.MERCHANT_BRANCH,
              phone: signupDto.contact || null,
            },
            emailRedirectTo: undefined, // No email confirmation for now
          },
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
          },
        });

        return {
          user: publicUser,
          branch,
        };
      });

      // 6. Return response (without sensitive data)
      // Use different message based on whether account is active or pending
      const successMessage =
        isActive
          ? API_RESPONSE_MESSAGES.AUTH.BRANCH_SIGNUP_SUCCESS_ADMIN
          : API_RESPONSE_MESSAGES.AUTH.BRANCH_SIGNUP_SUCCESS;

      return {
        status: 201,
        message: successMessage,
        data: {
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
        },
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
}

