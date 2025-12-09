/**
 * Serializer utility functions
 * Provides standard API response formatters for consistent API responses
 */

import { ApiResponse, PaginatedResponse } from '../types/global.types';
import { PaginationMeta } from './pagination.util';

/**
 * Create a standard API response
 * @param data - The response data
 * @param status - HTTP status code (defaults to 200)
 * @param message - Response message
 * @returns Formatted API response
 */
export function createApiResponse<T>(
  data: T,
  message: string,
  status: number = 200,
): ApiResponse<T> {
  return {
    data,
    status,
    message,
  };
}

/**
 * Create a paginated API response
 * @param items - Array of items for the current page
 * @param pagination - Pagination metadata
 * @param message - Response message
 * @param status - HTTP status code (defaults to 200)
 * @returns Formatted paginated API response
 */
export function createPaginatedResponse<T>(
  items: T[],
  pagination: PaginationMeta,
  message: string,
  status: number = 200,
): PaginatedResponse<T> {
  return {
    data: {
      items,
      pagination,
    },
    status,
    message,
  };
}

