/** Cache key helpers + TTLs for hot student-app endpoints. */

export const CACHE_TTL = {
  BRANDS: 120, // 2 min
  PUBLIC_STATS: 60,
  STUDENT_MERCHANT_LIST: 90,
  FEATURED_OFFERS: 120,
  ACTIVE_OFFERS: 60,
  MERCHANT_OFFERS: 90,
  INSTITUTES: 300,
  CATEGORIES: 300,
  APP_CONFIG: 60,
} as const;

export const CACHE_KEYS = {
  brands: () => 'cache:merchants:brands',
  publicStats: () => 'cache:merchants:public-stats',
  studentMerchantList: (parts: {
    page: number;
    limit: number;
    month?: string;
    search?: string;
    category?: string;
    subCategory?: string;
  }) =>
    `cache:merchants:student-list:p${parts.page}:l${parts.limit}:m${parts.month ?? ''}:s${(parts.search ?? '').toLowerCase()}:c${parts.category ?? ''}:sc${parts.subCategory ?? ''}`,
  featuredOffers: () => 'cache:offers:featured',
  activeOffers: (parts: {
    category?: string;
    lat?: number;
    lng?: number;
    radius?: number;
    sort?: string;
    page: number;
    limit: number;
  }) =>
    `cache:offers:active:c${parts.category ?? ''}:lat${parts.lat ?? ''}:lng${parts.lng ?? ''}:r${parts.radius ?? ''}:s${parts.sort ?? ''}:p${parts.page}:l${parts.limit}`,
  merchantOffers: (merchantId: string) =>
    `cache:offers:merchant:${merchantId}`,
  institutes: () => 'cache:institutes:list',
  categories: () => 'cache:categories:list',
  appConfig: () => 'cache:app-config',
  digestCronLock: (year: number, month: number) =>
    `lock:merchant-digest:${year}-${String(month).padStart(2, '0')}`,
} as const;

/** Prefixes to bust when merchants/offers change. */
export const CACHE_PREFIX = {
  merchants: 'cache:merchants:',
  offers: 'cache:offers:',
  institutes: 'cache:institutes:',
  categories: 'cache:categories:',
} as const;
