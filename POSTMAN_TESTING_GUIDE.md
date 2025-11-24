# Postman Testing Guide - Authentication API

This guide provides step-by-step instructions for testing the Parchi backend authentication API using Postman.

## Prerequisites

1. **Set up environment variables:**
   
   Create a `.env` file in the root directory with the following Supabase configuration:
   
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_JWT_SECRET=your_supabase_jwt_secret
   PORT=8080
   ```
   
   **Where to find these values:**
   - Go to your [Supabase Dashboard](https://app.supabase.com)
   - Select your project
   - Go to **Settings** → **API**
   - Copy the **Project URL** → Use as `SUPABASE_URL`
   - Copy the **anon/public** key → Use as `SUPABASE_ANON_KEY`
   - Copy the **JWT Secret** → Use as `SUPABASE_JWT_SECRET`
   
   **Important:** Make sure your `.env` file is in the root directory and contains valid Supabase credentials. Without these, you'll get an "Invalid API key" error.

2. **Start the backend server:**
   ```bash
   npm run start:dev
   ```
   The server runs on `http://localhost:8080` by default.

3. **Install Postman** (if not already installed)

---

## Step 1: Set Up Postman Environment

1. Open Postman
2. Click on **Environments** in the left sidebar
3. Click **+** to create a new environment
4. Name it: `Parchi Backend Local`
5. Add the following variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:8080` | `http://localhost:8080` |
| `access_token` | (leave empty) | (will be set automatically) |
| `refresh_token` | (leave empty) | (will be set automatically) |

6. Click **Save**
7. Select this environment from the dropdown in the top-right corner

---

## Step 2: Create a Collection

1. Click **Collections** in the left sidebar
2. Click **+** to create a new collection
3. Name it: `Parchi Auth API`
4. Click **Save**

---

## Step 3: Test Signup Endpoint

### 3.1 Create Signup Request

1. In your collection, click **Add Request**
2. Name it: `Signup - Student`
3. Set method to: **POST**
4. Enter URL: `{{base_url}}/auth/signup`
5. Go to **Body** tab
6. Select **raw** and **JSON** format
7. Enter this JSON:

```json
{
  "email": "student@example.com",
  "password": "password123",
  "role": "student",
  "phone": "+1234567890"
}
```

### 3.2 Add Test Script to Auto-Save Token

1. Go to **Tests** tab
2. Add this script:

```javascript
// Check if request was successful
if (pm.response.code === 201) {
    const jsonData = pm.response.json();
    
    // Save access token
    if (jsonData.data?.session?.access_token) {
        pm.environment.set("access_token", jsonData.data.session.access_token);
        console.log("✅ Access token saved");
    }
    
    // Save refresh token (optional)
    if (jsonData.data?.session?.refresh_token) {
        pm.environment.set("refresh_token", jsonData.data.session.refresh_token);
    }
    
    // Log user info
    console.log("User ID:", jsonData.data.user.id);
    console.log("User Role:", jsonData.data.user.role);
    console.log("Is Active:", jsonData.data.user.is_active);
}
```

### 3.3 Send Request

1. Click **Send**
2. Expected Response (201 Created):
```json
{
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "student@example.com",
      "role": "student",
      "is_active": false
    },
    "session": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "v1.xxx...",
      "expires_at": 1234567890,
      "expires_in": 3600,
      "token_type": "bearer"
    }
  },
  "status": 201,
  "message": "User registered successfully"
}
```

**Note:** Students and merchants have `is_active: false` until admin approval.

### 3.4 Test Other Roles

Create similar requests for:
- **Signup - Merchant Corporate**: Change role to `"merchant_corporate"`
- **Signup - Merchant Branch**: Change role to `"merchant_branch"`
- **Signup - Admin**: Change role to `"admin"` (will have `is_active: true`)

---

## Step 4: Test Login Endpoint

### 4.1 Create Login Request

1. Add new request: `Login`
2. Method: **POST**
3. URL: `{{base_url}}/auth/login`
4. **Body** tab → **raw** → **JSON**:

```json
{
  "email": "student@example.com",
  "password": "password123"
}
```

### 4.2 Add Test Script

```javascript
// Check if login was successful
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    
    // Save tokens
    if (jsonData.data?.session?.access_token) {
        pm.environment.set("access_token", jsonData.data.session.access_token);
        console.log("✅ Access token saved");
    }
    
    if (jsonData.data?.session?.refresh_token) {
        pm.environment.set("refresh_token", jsonData.data.session.refresh_token);
    }
    
    console.log("Login successful!");
    console.log("User:", jsonData.data.user.email);
    console.log("Role:", jsonData.data.user.role);
} else {
    console.log("Login failed:", pm.response.json());
}
```

### 4.3 Send Request

Expected Response (200 OK):
```json
{
  "data": {
    "user": {
      "id": "uuid-here",
      "email": "student@example.com",
      "role": "student",
      "is_active": true
    },
    "session": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "v1.xxx...",
      "expires_at": 1234567890,
      "expires_in": 3600,
      "token_type": "bearer"
    }
  },
  "status": 200,
  "message": "Login successful"
}
```

**Error Response (if account pending):**
```json
{
  "statusCode": 401,
  "message": "Account is pending approval",
  "error": "Unauthorized"
}
```

---

## Step 5: Test Get Profile Endpoint

### 5.1 Create Get Profile Request

1. Add new request: `Get Profile (Me)`
2. Method: **GET**
3. URL: `{{base_url}}/auth/me`
4. Go to **Authorization** tab
5. Select **Bearer Token** from Type dropdown
6. Enter: `{{access_token}}` in the Token field

**OR** use **Headers** tab:
- Key: `Authorization`
- Value: `Bearer {{access_token}}`

### 5.2 Send Request

Expected Response (200 OK):
```json
{
  "data": {
    "id": "uuid-here",
    "email": "student@example.com",
    "role": "student",
    "is_active": true
  },
  "status": 200,
  "message": "Profile retrieved successfully"
}
```

---

## Step 6: Test Logout Endpoint

### 6.1 Create Logout Request

1. Add new request: `Logout`
2. Method: **POST**
3. URL: `{{base_url}}/auth/logout`
4. **Authorization** tab → **Bearer Token** → `{{access_token}}`

### 6.2 Add Test Script (Optional)

```javascript
if (pm.response.code === 200) {
    // Clear tokens from environment
    pm.environment.unset("access_token");
    pm.environment.unset("refresh_token");
    console.log("✅ Logged out successfully");
}
```

### 6.3 Send Request

Expected Response (200 OK):
```json
{
  "data": null,
  "status": 200,
  "message": "Logout successful"
}
```

---

## Step 7: Test Role-Based Endpoints

### 7.1 Admin Only Endpoint

1. Add new request: `Admin Only`
2. Method: **GET**
3. URL: `{{base_url}}/auth/admin-only`
4. **Authorization** → **Bearer Token** → `{{access_token}}`

**Note:** This will only work if the logged-in user has `admin` role.

Expected Response (200 OK):
```json
{
  "data": {
    "message": "This is an admin-only endpoint",
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "role": "admin"
    }
  },
  "status": 200,
  "message": "Admin access granted"
}
```

### 7.2 Merchant Only Endpoint

1. Add new request: `Merchant Only`
2. Method: **GET**
3. URL: `{{base_url}}/auth/merchant-only`
4. **Authorization** → **Bearer Token** → `{{access_token}}`

**Note:** Works for both `merchant_corporate` and `merchant_branch` roles.

### 7.3 Student Only Endpoint

1. Add new request: `Student Only`
2. Method: **GET**
3. URL: `{{base_url}}/auth/student-only`
4. **Authorization** → **Bearer Token** → `{{access_token}}`

---

## Step 8: Test Error Scenarios

### 8.1 Invalid Credentials

**Request:** `Login` with wrong password
```json
{
  "email": "student@example.com",
  "password": "wrongpassword"
}
```

**Expected Response (401):**
```json
{
  "statusCode": 401,
  "message": "Invalid email or password",
  "error": "Unauthorized"
}
```

### 8.2 Duplicate Email Signup

**Request:** `Signup` with existing email
```json
{
  "email": "student@example.com",
  "password": "password123",
  "role": "student"
}
```

**Expected Response (409):**
```json
{
  "statusCode": 409,
  "message": "User with this email already exists",
  "error": "Conflict"
}
```

### 8.3 Invalid Role

**Request:** `Signup` with invalid role
```json
{
  "email": "test@example.com",
  "password": "password123",
  "role": "invalid_role"
}
```

**Expected Response (400):**
```json
{
  "statusCode": 400,
  "message": "Invalid role. Must be one of: student, merchant_corporate, merchant_branch, admin",
  "error": "Bad Request"
}
```

### 8.4 Unauthorized Access (No Token)

**Request:** `Get Profile` without Authorization header

**Expected Response (401):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 8.5 Invalid Token

**Request:** `Get Profile` with invalid token
- Authorization: `Bearer invalid_token_here`

**Expected Response (401):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 8.6 Forbidden Access (Wrong Role)

**Request:** `Admin Only` endpoint with a student token

**Expected Response (403):**
```json
{
  "statusCode": 403,
  "message": "Access forbidden",
  "error": "Forbidden"
}
```

---

## Step 9: Create a Test Flow (Collection Runner)

1. Right-click on your collection → **Run collection**
2. Select the requests you want to run in order:
   - Signup - Student
   - Login
   - Get Profile (Me)
   - Logout
3. Click **Run Parchi Auth API**
4. Review the results

---

## Quick Reference: All Endpoints

| Method | Endpoint | Auth Required | Role Required |
|--------|----------|---------------|---------------|
| POST | `/auth/signup` | No | - |
| POST | `/auth/login` | No | - |
| GET | `/auth/me` | Yes | - |
| POST | `/auth/logout` | Yes | - |
| GET | `/auth/admin-only` | Yes | `admin` |
| GET | `/auth/merchant-only` | Yes | `merchant_corporate` or `merchant_branch` |
| GET | `/auth/student-only` | Yes | `student` |

---

## Tips

1. **Token Management:** The test scripts automatically save tokens to environment variables
2. **Multiple Users:** Create separate requests for different user types (student, merchant, admin)
3. **Pre-request Scripts:** You can add pre-request scripts to check if token exists before making authenticated requests
4. **Collection Variables:** Use collection-level variables for shared data
5. **Export Collection:** Export your collection to share with your team

---

## Troubleshooting

### Invalid API Key Error
- **Error:** `{ "message": "Invalid API key", "error": "Bad Request", "statusCode": 400 }`
- **Cause:** Missing or invalid Supabase configuration in `.env` file
- **Solution:**
  1. Check that you have a `.env` file in the root directory
  2. Verify all required environment variables are set:
     - `SUPABASE_URL` - Your Supabase project URL
     - `SUPABASE_ANON_KEY` - Your Supabase anon/public key
     - `SUPABASE_JWT_SECRET` - Your Supabase JWT secret
  3. Make sure there are no extra spaces or quotes around the values
  4. Restart the server after updating `.env` file
  5. Verify your Supabase credentials are correct in the [Supabase Dashboard](https://app.supabase.com)

### Server Not Running
- Error: `Could not get any response`
- Solution: Make sure the backend server is running on port 8080

### Token Expired
- Error: `401 Unauthorized` after some time
- Solution: Login again to get a new token

### CORS Issues
- Error: CORS policy errors in browser console
- Solution: The server has CORS enabled, but if issues persist, check `main.ts`

### Invalid Token Format
- Error: `401 Unauthorized` even with valid token
- Solution: Make sure the Authorization header format is: `Bearer <token>` (with space)

---

## Example: Complete Test Sequence

1. **Signup as Student** → Save token
2. **Try Login** → Should fail (account pending)
3. **Signup as Admin** → Save token
4. **Login as Admin** → Should succeed
5. **Get Profile** → Should return admin user
6. **Try Admin Only** → Should succeed
7. **Try Student Only** → Should fail (403)
8. **Logout** → Should succeed

---

## Next Steps

1. Test all endpoints with different roles
2. Test error scenarios
3. Test edge cases (empty fields, special characters, etc.)
4. Export your collection for team sharing
5. Set up automated tests using Postman's test scripts

