/**
 * Pagination utility functions
 * Provides reusable pagination calculation and metadata generation
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Calculate pagination metadata
 * @param total - Total number of items
 * @param page - Current page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Pagination metadata object
 */
export function calculatePaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const pages = Math.ceil(total / limit);
  const hasNext = page * limit < total;
  const hasPrev = page > 1;

  return {
    page,
    limit,
    total,
    pages,
    hasNext,
    hasPrev,
  };
}

/**
 * Calculate skip value for database queries
 * @param page - Current page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Skip value for Prisma/ORM queries
 */
export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Normalize pagination parameters with defaults
 * @param page - Page number (defaults to 1)
 * @param limit - Items per page (defaults to 10)
 * @param maxLimit - Maximum allowed limit (defaults to 100)
 * @returns Normalized pagination parameters
 */
export function normalizePaginationParams(
  page?: number,
  limit?: number,
  maxLimit: number = 100,
): PaginationParams {
  const normalizedPage = Math.max(1, page || 1);
  const normalizedLimit = Math.min(
    Math.max(1, limit || 10),
    maxLimit,
  );

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}

