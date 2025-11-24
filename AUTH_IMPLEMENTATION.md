# Authentication Implementation Guide

This document describes the role-based authentication system implemented using Supabase for the Parchi backend.

## Overview

The authentication system supports 4 user roles:
- `student` - For student app users
- `merchant_corporate` - For corporate merchant accounts
- `merchant_branch` - For branch merchant accounts
- `admin` - For admin dashboard users

## Setup

### Environment Variables

Add the following environment variables to your `.env` file:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Schema

The system uses Supabase's built-in `auth.users` table for authentication and a custom `public.users` table for role management. The schema is already defined in `prisma/schema.prisma`.

## API Endpoints

### Signup

**POST** `/auth/signup`

Request body:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "role": "student",
  "phone": "+1234567890" // optional
}
```

Response:
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "student",
      "is_active": true
    },
    "session": {
      "access_token": "token",
      "refresh_token": "token",
      "expires_at": 1234567890
    }
  },
  "status": 201,
  "message": "User registered successfully"
}
```

### Login

**POST** `/auth/login`

Request body:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "student",
      "is_active": true
    },
    "session": {
      "access_token": "token",
      "refresh_token": "token",
      "expires_at": 1234567890
    }
  },
  "status": 200,
  "message": "Login successful"
}
```

### Get Profile

**GET** `/auth/me`

Headers:
```
Authorization: Bearer <access_token>
```

Response:
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "student"
  },
  "status": 200,
  "message": "Profile retrieved successfully"
}
```

## Using Guards and Decorators

### Protecting Routes with Authentication

Use the `JwtAuthGuard` to protect routes that require authentication:

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('example')
export class ExampleController {
  @Get('protected')
  @UseGuards(JwtAuthGuard)
  async protectedRoute(@Request() req) {
    // req.user contains the authenticated user
    return { user: req.user };
  }
}
```

### Role-Based Access Control

Use both `JwtAuthGuard` and `RolesGuard` with the `@Roles()` decorator to restrict access by role:

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../constants/app.constants';

@Controller('example')
export class ExampleController {
  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  async adminOnly(@Request() req) {
    // Only admins can access this
    return { message: 'Admin access' };
  }

  @Get('merchant-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE, ROLES.MERCHANT_BRANCH)
  async merchantOnly(@Request() req) {
    // Both corporate and branch merchants can access this
    return { message: 'Merchant access' };
  }

  @Get('student-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.STUDENT)
  async studentOnly(@Request() req) {
    // Only students can access this
    return { message: 'Student access' };
  }
}
```

## Available Roles

Import roles from constants:

```typescript
import { ROLES } from '../constants/app.constants';

// Available roles:
ROLES.STUDENT           // 'student'
ROLES.MERCHANT_CORPORATE // 'merchant_corporate'
ROLES.MERCHANT_BRANCH    // 'merchant_branch'
ROLES.ADMIN              // 'admin'
```

## Error Responses

The system returns standardized error responses:

- **401 Unauthorized**: Invalid or missing token
- **403 Forbidden**: User doesn't have required role
- **409 Conflict**: User already exists (signup)
- **400 Bad Request**: Invalid request data

## Architecture

The implementation follows the coding practices outlined in `CODING_PRACTICES.md`:

- **Domain-driven organization**: Auth module is self-contained
- **DTOs**: Request validation using class-validator
- **Guards**: Reusable authentication and authorization guards
- **Decorators**: Custom `@Roles()` decorator for role-based access
- **Constants**: Centralized role definitions and API response messages
- **Types**: TypeScript interfaces for type safety

## File Structure

```
src/
├── modules/
│   └── auth/
│       ├── dto/
│       │   ├── signup.dto.ts
│       │   └── login.dto.ts
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       └── auth.module.ts
├── common/
│   ├── config/
│   │   └── config.module.ts
│   └── guards/
│       ├── jwt-auth.guard.ts
│       └── roles.guard.ts
├── decorators/
│   └── roles.decorator.ts
├── constants/
│   ├── app.constants.ts
│   └── api-response/
│       └── api-response.constants.ts
└── types/
    └── global.types.ts
```

## Next Steps

1. Set up Supabase project and configure environment variables
2. Test signup and login endpoints
3. Implement role-specific features using the guards and decorators
4. Add additional endpoints as needed for each role

