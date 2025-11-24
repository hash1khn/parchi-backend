import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ApiResponse } from '../../types/global.types';
import { API_RESPONSE_MESSAGES } from '../../constants/api-response/api-response.constants';
import { ROLES, UserRole } from '../../constants/app.constants';
import { JwtPayload } from '../../types/global.types';

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
}

