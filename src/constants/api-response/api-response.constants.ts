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
  },
} as const;

