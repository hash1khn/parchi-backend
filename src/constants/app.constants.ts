export const ROLES = {
  STUDENT: 'student',
  MERCHANT_CORPORATE: 'merchant_corporate',
  MERCHANT_BRANCH: 'merchant_branch',
  ADMIN: 'admin',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

