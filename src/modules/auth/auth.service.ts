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

      return {
        id: publicUser.id,
        email: publicUser.email,
        role: publicUser.role,
        is_active: publicUser.is_active,
      };
    } catch (error) {
      return null;
    }
  }

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

  /**
   * Student signup with verification documents
   * Creates user in Supabase Auth, public.users, students, and student_kyc tables
   */
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

      // 2. Validate image URLs format (basic validation)
      // In production, you might want to verify URLs are accessible
      const urlPattern = /^https?:\/\/.+/;
      if (
        !urlPattern.test(signupDto.studentIdImageUrl) ||
        !urlPattern.test(signupDto.selfieImageUrl)
      ) {
        throw new UnprocessableEntityException(
          API_RESPONSE_MESSAGES.AUTH.STUDENT_SIGNUP_INVALID_IMAGES,
        );
      }

      // 3. Create user in Supabase Auth with password from frontend
      const { data: authData, error: authError } =
        await this.supabase.auth.signUp({
          email: signupDto.email,
          password: signupDto.password,
          options: {
            data: {
              role: ROLES.STUDENT,
              phone: signupDto.phone || null,
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

      // 5. Generate unique Parchi ID
      const parchiId = await generateParchiId(this.prisma);

      // 6. Use transaction to create all related records atomically
      const result = await this.prisma.$transaction(async (tx) => {
        // Create public.users record
        const publicUser = await tx.public_users.create({
          data: {
            id: userId,
            email: signupDto.email,
            phone: signupDto.phone || null,
            role: ROLES.STUDENT,
            is_active: false, // Inactive until verification approved
          },
        });

        // Create students record
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

        // Create student_kyc record
        const studentKyc = await tx.student_kyc.create({
          data: {
            student_id: student.id,
            student_id_image_path: signupDto.studentIdImageUrl,
            selfie_image_path: signupDto.selfieImageUrl,
            status: 'pending',
          },
        });

        return {
          user: publicUser,
          student,
          studentKyc,
        };
      });

      // 7. Return response (without sensitive data)
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
}

