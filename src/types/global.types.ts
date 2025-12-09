import { UserRole } from '../constants/app.constants';

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
}

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  // Role-specific details (only populated for the user's role)
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
  } | null;
  branch?: {
    id: string;
    branch_name: string;
    merchant_id: string;
    city: string;
  } | null;
}

