import { UserRole } from '../constants/app.constants';

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  message: string;
}

export interface PaginatedResponse<T = any> {
  data: {
    data: T[];
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

