export const ROLES = {
  STUDENT: 'student',
  MERCHANT_CORPORATE: 'merchant_corporate',
  MERCHANT_BRANCH: 'merchant_branch',
  ADMIN: 'admin',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

export const VERIFICATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;

export type VerificationStatus =
  typeof VERIFICATION_STATUS[keyof typeof VERIFICATION_STATUS];

export const OFFER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type OfferStatus = typeof OFFER_STATUS[keyof typeof OFFER_STATUS];

export const DISCOUNT_TYPE = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
  ITEM: 'item',
} as const;

export type DiscountType = typeof DISCOUNT_TYPE[keyof typeof DISCOUNT_TYPE];

export const REDEMPTION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export type RedemptionStatus =
  typeof REDEMPTION_STATUS[keyof typeof REDEMPTION_STATUS];

export const SCHEDULE_TYPE = {
  ALWAYS: 'always',
  CUSTOM: 'custom',
} as const;

export type ScheduleType = typeof SCHEDULE_TYPE[keyof typeof SCHEDULE_TYPE];

export const APPROVE_REJECT_ACTION = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ApproveRejectAction =
  typeof APPROVE_REJECT_ACTION[keyof typeof APPROVE_REJECT_ACTION];

