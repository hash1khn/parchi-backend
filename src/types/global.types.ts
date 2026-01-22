import { UserRole } from '../constants/app.constants';

export type { UserRole };

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  message: string;
}

export interface PaginatedResponse<T = any> {
  data: {
    items: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
  status: number;
  message: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
  // Supabase-specific metadata fields
  user_metadata?: {
    role?: UserRole;
    phone?: string;
    first_name?: string;
    merchant_id?: string;  // For MERCHANT_CORPORATE users
    branch_id?: string;    // For MERCHANT_BRANCH users
    [key: string]: any;
  };
  app_metadata?: {
    role?: UserRole;
    [key: string]: any;
  };
}

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  // IDs extracted from JWT metadata (zero-DB-query auth)
  merchant_id?: string;  // For MERCHANT_CORPORATE users
  branch_id?: string;    // For MERCHANT_BRANCH users
  // Legacy nested objects (deprecated - use IDs above)
  // Kept for backwards compatibility with /auth/me endpoint
  is_active?: boolean;
  student?: {
    first_name: string;
    last_name: string;
    parchi_id: string;
    university: string;
  } | null;
  merchant?: {
    id: string;
    business_name: string;
    email_prefix: string | null;
    category: string | null;
    is_active: boolean;
  } | null;
  branch?: {
    id: string;
    branch_name: string;
    merchant_id: string;
    city: string;
  } | null;
}

