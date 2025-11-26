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
  },
} as const;

