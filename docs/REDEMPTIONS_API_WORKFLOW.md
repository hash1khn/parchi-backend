# Redemptions API Workflow

## Overview
This document outlines the workflow for implementing redemption APIs that allow students to redeem offers and branch staff to verify redemptions.

## Database Schema
- **redemptions** table: Stores redemption records
- **student_merchant_stats**: Tracks redemption counts and savings per student per merchant
- **student_branch_stats**: Tracks redemption counts and savings per student per branch
- **merchant_bonus_settings**: Defines bonus discount rules (redemptions_required, discount_type, discount_value)

## Module Structure

### 1. Redemptions Module
```
src/modules/redemptions/
├── redemptions.module.ts
├── redemptions.service.ts
├── redemptions.controller.ts (Student endpoints)
├── admin-redemptions.controller.ts (Admin/Branch endpoints)
    └── dto/
        ├── create-redemption.dto.ts
        ├── update-redemption.dto.ts
        ├── query-redemptions.dto.ts
        └── redemption-history-query.dto.ts
```

## API Endpoints

### Student Endpoints (`/redemptions`)

#### 1. Get My Redemptions (History)
- **GET** `/redemptions`
- **Auth**: Student only
- **Query Params**: 
  - `status`: 'pending' | 'verified' | 'rejected' (optional)
  - `startDate`: ISO date string (optional) - Filter from date
  - `endDate`: ISO date string (optional) - Filter to date
  - `merchantId`: string (optional) - Filter by merchant
  - `branchId`: string (optional) - Filter by branch
  - `offerId`: string (optional) - Filter by offer
  - `sort`: 'newest' | 'oldest' | 'merchant' | 'savings' (default: 'newest')
  - `page`: number (default: 1)
  - `limit`: number (default: 10)
- **Description**: Get comprehensive history of student's own redemptions with advanced filtering, sorting, and pagination
- **Response**: Paginated list with full redemption details including offer, merchant, branch info

#### 2. Get Redemption Details
- **GET** `/redemptions/:id`
- **Auth**: Student only
- **Description**: Get details of a specific redemption (only own redemptions)

#### 3. Get Redemption History by Merchant
- **GET** `/redemptions/merchant/:merchantId`
- **Auth**: Student only
- **Query Params**: 
  - `status`: 'pending' | 'verified' | 'rejected' (optional)
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `page`: number (default: 1)
  - `limit`: number (default: 10)
- **Description**: Get redemption history for a specific merchant with date filtering

#### 4. Get Redemption History by Branch
- **GET** `/redemptions/branch/:branchId`
- **Auth**: Student only
- **Query Params**: 
  - `status`: 'pending' | 'verified' | 'rejected' (optional)
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `page`: number (default: 1)
  - `limit`: number (default: 10)
- **Description**: Get redemption history for a specific branch

#### 5. Get Redemption History Summary
- **GET** `/redemptions/history/summary`
- **Auth**: Student only
- **Query Params**:
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `groupBy`: 'month' | 'week' | 'day' | 'merchant' | 'branch' (default: 'month')
- **Description**: Get aggregated redemption history summary with grouping options
- **Response**: 
  ```typescript
  {
    totalRedemptions: number;
    totalSavings: number;
    verifiedRedemptions: number;
    pendingRedemptions: number;
    groupedData: Array<{
      period: string; // or merchant/branch name
      count: number;
      savings: number;
    }>;
  }
  ```

#### 6. Get Redemption Statistics
- **GET** `/redemptions/stats`
- **Auth**: Student only
- **Description**: Get student's overall redemption statistics (total redemptions, total savings, top merchants, etc.)
- **Response**:
  ```typescript
  {
    totalRedemptions: number;
    totalSavings: number;
    verifiedRedemptions: number;
    pendingRedemptions: number;
    rejectedRedemptions: number;
    topMerchants: Array<{
      merchantId: string;
      merchantName: string;
      redemptionCount: number;
      totalSavings: number;
    }>;
    topBranches: Array<{
      branchId: string;
      branchName: string;
      redemptionCount: number;
      totalSavings: number;
    }>;
    recentRedemptions: RedemptionResponse[]; // Last 5 redemptions
  }
  ```

### Branch Staff Endpoints (`/admin/redemptions`)

#### 1. Create Redemption
- **POST** `/admin/redemptions`
- **Auth**: Merchant Branch only
- **Description**: Branch staff creates a redemption by entering student's parchi ID and selecting an offer
- **Request Body**:
  ```typescript
  {
    parchiId: string; // Student's parchi ID
    offerId: string;
    notes?: string; // Optional notes
  }
  ```
- **Business Logic**:
  1. Verify branch staff's branch exists and is active
  2. Find student by parchi ID
  3. Verify student exists and is verified (verification_status = 'approved')
  4. Verify offer exists, is active, and within validity period
  5. Verify offer is available at the branch staff's branch
  6. Check offer limits (daily_limit, total_limit)
  7. Check if student has reached daily limit for this offer at this branch
  8. Calculate if bonus discount applies (check merchant_bonus_settings and student_merchant_stats)
  9. Create redemption record with:
     - student_id (from parchi ID lookup)
     - offer_id
     - branch_id (from branch staff's branch)
     - verified_by (branch staff user ID - auto-verified since branch staff creates it)
     - is_bonus_applied and bonus_discount_applied (if applicable)
     - notes (if provided)
  10. Update offer.current_redemptions (increment)
  11. Update student_merchant_stats and student_branch_stats
  12. Update student.total_redemptions and total_savings
  13. Return redemption details with full offer, student, and branch info

#### 2. Get Branch Redemptions (History)
- **GET** `/admin/redemptions`
- **Auth**: Merchant Branch only
- **Query Params**:
  - `status`: 'pending' | 'verified' | 'rejected' (optional)
  - `startDate`: ISO date string (optional) - Filter from date
  - `endDate`: ISO date string (optional) - Filter to date
  - `studentId`: string (optional) - Filter by student
  - `parchiId`: string (optional) - Filter by student parchi ID
  - `offerId`: string (optional) - Filter by offer
  - `sort`: 'newest' | 'oldest' | 'student' | 'status' (default: 'newest')
  - `page`: number (default: 1)
  - `limit`: number (default: 10)
- **Description**: Get comprehensive history of all redemptions for the branch staff's branch with filtering and sorting

#### 3. Get Redemption Details (Branch)
- **GET** `/admin/redemptions/:id`
- **Auth**: Merchant Branch only
- **Description**: Get details of a specific redemption for branch staff's branch

#### 4. Update/Reject Redemption
- **PATCH** `/admin/redemptions/:id`
- **Auth**: Merchant Branch only
- **Request Body**:
  ```typescript
  {
    action?: 'reject'; // Only reject is allowed (can't undo verification)
    notes?: string;
  }
  ```
- **Business Logic**:
  1. Verify redemption exists and belongs to branch staff's branch
  2. If rejecting:
     - Mark as rejected
     - Update notes if provided
     - Revert offer.current_redemptions (decrement)
     - Revert student stats (decrement counts and savings)
     - Note: Can only reject redemptions created by this branch

#### 5. Get Branch Redemption Analytics
- **GET** `/admin/redemptions/analytics`
- **Auth**: Merchant Branch only
- **Query Params**:
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `groupBy`: 'day' | 'week' | 'month' (default: 'day')
- **Description**: Get analytics for branch redemptions (counts, savings, trends)
- **Response**:
  ```typescript
  {
    totalRedemptions: number;
    totalSavings: number;
    verifiedRedemptions: number;
    pendingRedemptions: number;
    redemptionsByPeriod: Array<{
      period: string;
      count: number;
      savings: number;
    }>;
    topOffers: Array<{
      offerId: string;
      offerTitle: string;
      redemptionCount: number;
    }>;
    topStudents: Array<{
      studentId: string;
      parchiId: string;
      studentName: string;
      redemptionCount: number;
      totalSavings: number;
    }>;
  }
  ```

### Admin Endpoints (`/admin/redemptions`)

#### 1. Get All Redemptions (History)
- **GET** `/admin/redemptions`
- **Auth**: Admin only
- **Query Params**:
  - `status`: 'pending' | 'verified' | 'rejected' (optional)
  - `studentId`: string (optional)
  - `merchantId`: string (optional)
  - `branchId`: string (optional)
  - `offerId`: string (optional)
  - `startDate`: ISO date string (optional) - Filter from date
  - `endDate`: ISO date string (optional) - Filter to date
  - `sort`: 'newest' | 'oldest' | 'student' | 'merchant' | 'branch' | 'status' (default: 'newest')
  - `page`: number (default: 1)
  - `limit`: number (default: 10)
- **Description**: Get comprehensive history of all redemptions with advanced filtering, sorting, and pagination

#### 2. Get Redemption Details (Admin)
- **GET** `/admin/redemptions/:id`
- **Auth**: Admin only
- **Description**: Get details of any redemption

#### 3. Get Redemption Analytics (Admin)
- **GET** `/admin/redemptions/analytics`
- **Auth**: Admin only
- **Query Params**:
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `merchantId`: string (optional)
  - `branchId`: string (optional)
  - `groupBy`: 'day' | 'week' | 'month' | 'merchant' | 'branch' (default: 'day')
- **Description**: Get system-wide redemption analytics with grouping options
- **Response**:
  ```typescript
  {
    totalRedemptions: number;
    totalSavings: number;
    verifiedRedemptions: number;
    pendingRedemptions: number;
    rejectedRedemptions: number;
    averageSavingsPerRedemption: number;
    redemptionsByPeriod: Array<{
      period: string;
      count: number;
      savings: number;
    }>;
    topMerchants: Array<{
      merchantId: string;
      merchantName: string;
      redemptionCount: number;
      totalSavings: number;
    }>;
    topBranches: Array<{
      branchId: string;
      branchName: string;
      redemptionCount: number;
      totalSavings: number;
    }>;
    topOffers: Array<{
      offerId: string;
      offerTitle: string;
      redemptionCount: number;
    }>;
  }
  ```

#### 4. Get Redemption History Export
- **GET** `/admin/redemptions/export`
- **Auth**: Admin only
- **Query Params**:
  - `format`: 'csv' | 'json' (default: 'csv')
  - `startDate`: ISO date string (optional)
  - `endDate`: ISO date string (optional)
  - `merchantId`: string (optional)
  - `branchId`: string (optional)
  - `status`: 'pending' | 'verified' | 'rejected' (optional)
- **Description**: Export redemption history data for reporting/analysis
- **Response**: File download (CSV or JSON)

## Business Rules

### Redemption Validation
1. **Parchi ID Lookup**: Find student by parchi ID (case-insensitive, exact match)
2. **Student Verification**: Student must be verified (verification_status = 'approved')
3. **Branch Staff Branch**: Redemption is automatically assigned to branch staff's branch
4. **Offer Validity**: 
   - Offer status must be 'active'
   - Current date must be between valid_from and valid_until
   - Offer must be assigned to the branch staff's branch
5. **Offer Limits**:
   - Check total_limit: current_redemptions < total_limit
   - Check daily_limit: Count redemptions for this offer today at this branch < daily_limit
   - Check student's daily limit for this offer at this branch
6. **Branch Validity**: Branch must be active and belong to the merchant

### Bonus Discount Logic
1. Check if merchant has bonus settings (merchant_bonus_settings)
2. Check student_merchant_stats for redemption_count at this merchant
3. If redemption_count >= redemptions_required:
   - Calculate bonus discount based on discount_type and discount_value
   - Apply max_discount_amount if applicable
   - Mark is_bonus_applied = true
   - Store bonus_discount_applied value

### Statistics Updates
When redemption is created (by branch staff):
1. **Offer**: Increment current_redemptions
2. **Student**: 
   - Increment total_redemptions
   - Add savings to total_savings (offer discount + bonus if applicable)
3. **student_merchant_stats**:
   - Increment redemption_count
   - Add savings to total_savings
   - Update last_redemption_at
4. **student_branch_stats**:
   - Increment redemption_count
   - Add savings to total_savings
   - Update last_redemption_at
5. **Redemption**: Set verified_by to branch staff user ID (auto-verified)

When redemption is rejected (by branch staff):
- Reverse all the above updates (decrement counts, subtract savings)
- Mark redemption as rejected

## Response Types

### Redemption Response
```typescript
{
  id: string;
  studentId: string;
  offerId: string;
  branchId: string;
  isBonusApplied: boolean;
  bonusDiscountApplied: number | null;
  verifiedBy: string | null;
  notes: string | null;
  createdAt: Date;
  status: 'pending' | 'verified' | 'rejected';
  offer?: {
    id: string;
    title: string;
    discountType: string;
    discountValue: number;
  };
  branch?: {
    id: string;
    branchName: string;
    address: string;
  };
  student?: {
    id: string;
    parchiId: string;
    firstName: string;
    lastName: string;
  };
}
```

## Error Handling

### Common Errors
1. **STUDENT_NOT_FOUND**: Student with provided parchi ID doesn't exist
2. **STUDENT_NOT_VERIFIED**: Student verification pending or rejected
3. **OFFER_NOT_FOUND**: Offer doesn't exist
4. **OFFER_NOT_ACTIVE**: Offer is not active or expired
5. **OFFER_NOT_AVAILABLE_AT_BRANCH**: Offer not assigned to branch staff's branch
6. **OFFER_LIMIT_REACHED**: Daily or total limit reached
7. **STUDENT_DAILY_LIMIT_REACHED**: Student has reached daily limit for this offer
8. **BRANCH_NOT_FOUND**: Branch doesn't exist
9. **BRANCH_NOT_ACTIVE**: Branch is inactive
10. **BRANCH_ACCESS_DENIED**: Branch staff doesn't belong to a valid branch
11. **REDEMPTION_NOT_FOUND**: Redemption doesn't exist
12. **REDEMPTION_ALREADY_REJECTED**: Redemption already rejected
13. **ACCESS_DENIED**: User doesn't have permission
14. **INVALID_PARCHI_ID**: Parchi ID format is invalid

## Implementation Steps

1. **Create Module Structure**
   - Create redemptions module, service, and controllers
   - Set up DTOs with validation

2. **Implement Service Methods**
   - Create redemption (with all validations)
   - Get redemptions (with filtering and pagination)
   - Verify redemption (approve/reject)
   - Calculate bonus discounts
   - Update statistics

3. **Add API Response Constants**
   - Add REDEMPTION messages to api-response.constants.ts

4. **Register Module**
   - Add RedemptionsModule to AppModule

5. **Testing**
   - Test all endpoints
   - Test business logic (limits, bonus calculations)
   - Test authorization (roles)

## Redemption History Features

### History Filtering Options
- **Date Range**: Filter redemptions by creation date (startDate, endDate)
- **Status**: Filter by redemption status (pending, verified, rejected)
- **Merchant**: Filter by specific merchant
- **Branch**: Filter by specific branch
- **Offer**: Filter by specific offer
- **Student**: Filter by specific student (admin/branch only)

### History Sorting Options
- **newest**: Most recent first (default)
- **oldest**: Oldest first
- **merchant**: Group by merchant name
- **branch**: Group by branch name
- **student**: Group by student name
- **savings**: Sort by savings amount (descending)
- **status**: Group by status

### History Grouping (for Summary/Analytics)
- **day**: Group by day
- **week**: Group by week
- **month**: Group by month
- **merchant**: Group by merchant
- **branch**: Group by branch

### History Response Enhancements
All history endpoints return redemptions with full related data:
- Offer details (title, discount, image)
- Merchant details (name, logo, category)
- Branch details (name, address, city)
- Student details (name, parchiId) - for branch/admin
- Verification details (verifiedBy, notes, verification date)

## Notes

- **Redemptions are created by branch staff** (not students)
- Branch staff enters student's parchi ID and selects the offer
- Redemptions are **auto-verified** when created by branch staff (verified_by is set immediately)
- Branch staff can reject a redemption if needed (reverses all statistics)
- Bonus discounts are calculated at redemption creation time
- All statistics are updated atomically using transactions
- Branch staff can only create/see redemptions for their own branch
- Students can only view their own redemptions (read-only)
- Admins have full access to all redemptions
- History endpoints support comprehensive filtering, sorting, and pagination
- Date filtering uses ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
- All history queries are optimized with proper database indexes
- Parchi ID lookup is case-insensitive and must match exactly

