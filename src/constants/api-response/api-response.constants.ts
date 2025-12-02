export const API_RESPONSE_MESSAGES = {
  // Auth messages
  AUTH: {
    SIGNUP_SUCCESS: 'User registered successfully',
    LOGIN_SUCCESS: 'Login successful',
    LOGOUT_SUCCESS: 'Logout successful',
    INVALID_CREDENTIALS: 'Invalid email or password',
    USER_ALREADY_EXISTS: 'User with this email already exists',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    TOKEN_INVALID: 'Invalid or expired token',
    EMAIL_NOT_VERIFIED: 'Email not verified',
    ACCOUNT_PENDING: 'Account is pending approval',
    ACCOUNT_REJECTED: 'Account has been rejected',
    STUDENT_SIGNUP_SUCCESS:
      'Student signup request submitted successfully. Verification pending.',
    STUDENT_SIGNUP_EMAIL_EXISTS: 'Email already registered',
    STUDENT_SIGNUP_INVALID_IMAGES: 'Invalid image URLs or images not accessible',
    CORPORATE_SIGNUP_SUCCESS:
      'Corporate account created successfully. Verification pending.',
    CORPORATE_SIGNUP_EMAIL_EXISTS: 'Email already registered',
    CORPORATE_SIGNUP_INVALID_LOGO: 'Invalid logo URL format',
    BRANCH_SIGNUP_SUCCESS:
      'Branch account created successfully. Verification pending.',
    BRANCH_SIGNUP_SUCCESS_ADMIN:
      'Branch account created successfully and activated.',
    BRANCH_SIGNUP_EMAIL_EXISTS: 'Email already registered',
    BRANCH_SIGNUP_INVALID_CORPORATE: 'Invalid or non-existent corporate account',
    FORGOT_PASSWORD_SUCCESS: 'Password reset email sent successfully',
    CHANGE_PASSWORD_SUCCESS: 'Password changed successfully',
    CHANGE_PASSWORD_INVALID_CURRENT: 'Current password is incorrect',
    CHANGE_PASSWORD_FAILED: 'Password change failed',
    USER_NOT_FOUND: 'User not found',
  },
  // Merchant messages
  MERCHANT: {
    LIST_SUCCESS: 'Corporate merchants retrieved successfully',
    NOT_FOUND: 'Merchant not found',
    INVALID_ID: 'Invalid merchant ID',
    GET_SUCCESS: 'Corporate account retrieved successfully',
    CREATE_SUCCESS: 'Corporate account created successfully',
    UPDATE_SUCCESS: 'Corporate account updated successfully',
    DELETE_SUCCESS: 'Corporate account deleted successfully',
    BRANCH_LIST_SUCCESS: 'Branches retrieved successfully',
    BRANCH_GET_SUCCESS: 'Branch retrieved successfully',
    BRANCH_CREATE_SUCCESS: 'Branch created successfully',
    BRANCH_UPDATE_SUCCESS: 'Branch updated successfully',
    BRANCH_DELETE_SUCCESS: 'Branch deleted successfully',
    BRANCH_APPROVE_SUCCESS: 'Branch approved successfully',
    BRANCH_REJECT_SUCCESS: 'Branch rejected successfully',
    BRANCH_NOT_FOUND: 'Branch not found',
    BRANCH_ACCESS_DENIED: 'Access denied. You can only manage your own branches',
    CORPORATE_ACCESS_DENIED: 'Access denied. Only admins can manage corporate accounts',
  },
} as const;

