# Parchi Bug Fixes & Feature Plan — Round 2

## Context
Follow-up backlog focused on data integrity (redemption counters drifting from the `redemptions` source of truth), redemption-flow parity between manual and QR scans, admin dashboard additions, a major upgrade to the "All Students" filtering/export experience, and a handful of student-app UI polish items. A few items are explicitly owned by Aawaiz and are listed at the end for visibility only.

---

## 1. Data Migration — Resync Denormalized Redemption Counters to `redemptions` Source of Truth

**Trigger:** Rows were manually deleted from `redemptions` for 14th Street Pizza, but the denormalized counter tables were never decremented, so they now overstate reality.

**Tables that drift out of sync** (all derived from `redemptions`, schema.prisma):
- `students`: `total_redemptions`, `lifetime_redemptions`, `total_savings`, `last_redemption_at` (lines 663-681)
- `student_branch_stats`: `redemption_count`, `total_savings`, `last_redemption_at` per (student, branch) (lines 604-617)
- `student_merchant_stats`: `redemption_count`, `total_savings`, `last_redemption_at` per (student, merchant) (lines 639-652)
- `student_offer_stats`: `redemption_count`, `total_savings`, `last_redemption_at` per (student, offer) (lines 986-998)
- `offers`: `current_redemptions` (line 536)

**Approach:** A one-off, idempotent recompute script (extends the pattern already used in `parchi-backend/scratch/fix_lifetime_redemptions.ts` and `migrate_lifetime_redemptions.ts`, which only handle `lifetime_redemptions`):

1. For each table above, **zero out** the relevant counters (or compute fresh and overwrite, not increment).
2. Re-aggregate from `redemptions` grouped by the relevant key(s) — `student_id`, `(student_id, branch_id)`, `(student_id, merchant_id)`, `(student_id, offer_id)`, `offer_id` — counting only rows that represent a *valid* redemption (i.e. `notes` does NOT start with `"REJECTED:"` — see `redemptions.service.ts` rejection flow line ~1170).
3. Write the recomputed values back via batched updates (mirror the batching style in `fix_lifetime_redemptions.ts`).
4. Run scoped first (e.g. just the 14th Street Pizza branch/merchant + its students) to validate, then run platform-wide.

**Known related bug to fix while in this code** — `rejectRedemption()` (`redemptions.service.ts` lines 1108-1293) reverts `students`, `student_merchant_stats`, and `student_branch_stats`, but **not `student_offer_stats`**. Add the missing decrement so future rejections don't reintroduce drift in that table. (lines ~1257-1286 show the pattern to copy.)

---

## 2. Audit — QR Redemptions Not Reflecting Everywhere Manual Redemptions Do

**Finding from code review:** Both flows ultimately call the same internal method, `createRedemptionByIds()` in `qr-redemptions.service.ts` (lines 1982-2208), which updates the identical 6 tables/fields as the manual flow in `redemptions.service.ts` (`createRedemption()`, lines 283-489). At the DB-write level there is **no difference** — so the gap is likely in one of:

- **UI refresh/reactivity**: Branch dashboard subscribes to `qr-redemptions` realtime channel + 8s polling (`branch-dashboard.tsx` lines 91-185) for the QR flow, but manual redemptions update local state directly on API response. If some downstream view (e.g. "today's redemption count", recent activity feed) is only refreshed by the manual-flow code path, QR-created redemptions won't appear there until next poll/refresh — or not at all if that refresh call is missing entirely from the QR success handler.
- **Auto-approve vs manual-approve QR sub-paths** (`qr-redemptions.service.ts`, auto: lines 164-207, manual-approve: lines 431-481) — confirm both actually reach `createRedemptionByIds()` and that neither path can leave a `qr_redemption_requests` row at `status: 'approved'`/`'auto_approved'` without the linked `redemptions` row existing (partial failure / no rollback).
- **Student-app surfaces**: leaderboard, "recent redemptions", profile stats — confirm these read from `students.lifetime_redemptions` / `redemptions` directly (which both flows update) rather than from any QR-specific cache.

**Plan:** Do a side-by-side audit — perform one manual redemption and one QR redemption for the same test student/branch, then diff every surface (branch dashboard live counters, student app home + redemption history + leaderboard rank, admin redemption engine, admin students table `lifetime_redemptions`). Whichever surface diverges points to the missing refresh/update — fix that specific call site. No speculative fix until the diverging surface is identified.

---

## 3. Student Profile Modal — Wider
**Already captured** as item 11 in `bugs_and_features_plan.md` (`student-profile-modal.tsx`, `max-w-4xl` → `max-w-6xl`/`max-w-[90vw]`). Re-raising here confirms it as a priority — no separate work needed beyond that existing item.

---

## 4. Mobile Notifications — Make Expandable
**File:** `Parchi-Flutter/parchi_student_app/lib/screens/home/notfication/notification_screen.dart` (item builder ~lines 291-367)

Currently `content` is capped at `maxLines: 2` with ellipsis, and the whole row's `onTap` (lines 75-111) opens `linkUrl` externally — there's no way to read full text without leaving the app.

**Fix:**
- Add per-item expand/collapse state (e.g. a `Set<String> _expandedIds` in the screen's state).
- Tapping the row toggles expansion (remove `maxLines`/`ellipsis` when expanded, show full `content`), with a chevron icon that rotates 180° to indicate state.
- If `linkUrl` is present, show it as a separate "Open" button/CTA *inside* the expanded content — don't conflate "expand" and "navigate away" into the same tap target.

---

## 5. Admin Dashboard — Top Weekly Redeemers Widget

**Backend:** New method in `admin-dashboard.service.ts` (alongside `getTopMerchants()`, lines 205-264, and `getLeaderboardCount()`, lines 423-432), e.g. `getTopWeeklyRedeemers()`:
- `redemptions.groupBy(['student_id'], where: { created_at: { gte: <7 days ago> } }, _count, orderBy desc, take ~10)`
- Join back to `students` for name, university, parchi_id, profile picture
- Expose via existing `GET /admin/dashboard/stats` response (new `topWeeklyRedeemers` array) or a dedicated `GET /admin/dashboard/top-weekly-redeemers` endpoint, following the isolated-endpoint pattern already used for top-merchants

**Frontend:** New card/section in `admin-dashboard.tsx`, modeled on the existing `TopPerformingMerchants` component — ranked list of students with name, university, redemption count for the trailing 7 days. Add `topWeeklyRedeemers` to the `AdminDashboardStats` type in `api-client.ts`.

---

## 6. All Students Tab — Advanced Filter Builder + CSV Export (Heavy)

**Goal:** Supabase-style filter builder — attribute → operator → value, multiple filters AND-ed together, applied server-side, with a CSV export of the exact result set.

### 6a. Filterable Attribute Taxonomy
Two categories of attributes, because they require different query strategies:

- **Student/KYC attributes** (direct columns on `students`/`student_kyc`, schema.prisma lines 619-705): gender, university, graduation_year, platform, is_founders_club, verification_status, created_at (signup date), date_of_birth, degree, year_of_study, city.
- **Redemption-derived attributes** (require joining `redemptions` → `offers`): offer category/subcategory redeemed, merchant redeemed at, redemption date range, redemption count. Example from the brief: "male IBA students who redeemed a coffee offer between 14 May–14 June" = student filters (`gender = male`, `university = IBA`) AND a redemption-exists filter (`offers.subcategory = coffee` AND `redemptions.created_at BETWEEN ...`).

Each attribute is typed (string/enum/number/date/boolean), which determines its valid operators:
- string/enum → `equals`, `not equals`, `in`, `contains`
- number → `=`, `!=`, `>`, `<`, `>=`, `<=`, `between`
- date → `before`, `after`, `between`
- boolean → `is true` / `is false`

### 6b. Backend — Dynamic Filter Engine
**Files:** `query-students.dto.ts`, `students.service.ts` (`getAllStudents`, lines 329-556)

- Extend the DTO to accept a `filters` array: `[{ field: string, operator: string, value: string | string[] }]` (JSON-encoded query param).
- Build a registry mapping `field` → `{ column path, type, allowed operators }`. For direct student/KYC fields, map operator → Prisma clause (`equals`, `gt`, `lt`, `gte`, `lte`, `contains`, `in`).
- For redemption-derived fields, translate to a nested `redemptions: { some: { ...offer/category filter..., created_at: {...} } }` clause, combined with the direct filters via top-level `AND`.
- Also fix the existing **gender filter bug** noted during exploration — `gender` is accepted by the DTO but never applied in `getAllStudents()` (students.service.ts ~line 395). Wire it into the new filter engine (or fix directly if shipped first).
- Keep existing fixed filters (KYC status, founders club, etc.) working — they can be expressed as pre-set entries in the same `filters` array internally, or remain as-is alongside the new generic filters (additive, not a rewrite).

### 6c. Frontend — Filter Builder UI
**File:** `admin-students.tsx`

- New "Add Filter" UI: each filter row = attribute `Select` → operator `Select` (options depend on attribute type) → value input (text/number/date-range-picker/multi-select depending on attribute+operator).
- Support multiple rows (AND-combined), each removable.
- "Apply Filters" triggers `useAllStudents` with the serialized `filters` array.
- Keep the existing quick filters (university, KYC status, etc.) as shortcuts that pre-populate a filter row, for users who don't need the full builder.

### 6d. CSV Export
**No existing CSV infra in the codebase** — net new.

- Backend: `GET /admin/students/export` — accepts the same `filters`/query params as the list endpoint, runs the query **without pagination**, streams/returns CSV (column headers + one row per student). Use a small CSV-writing helper (manual `Array.join(',')` with proper quoting/escaping is sufficient given the limited column set — no need for a new dependency unless the team prefers `json2csv`).
- Frontend: "Export CSV" button next to the filter bar — calls the export endpoint with current filters, triggers a browser download (`Blob` + `URL.createObjectURL`).
- For very large result sets, consider a server-side row cap (e.g. 50k) with a warning toast if exceeded — confirm with the team whether this is a real concern before adding complexity.

---

## 7. Student App — Recent Redemptions Don't Feel Clickable
**File:** `Parchi-Flutter/parchi_student_app/lib/screens/profile/redemption_history/redemption_history_screen.dart` (`_buildRedemptionNotificationItem`, lines 297-402)

Already wired with `InkWell` + `onTap` → `RedemptionDetailScreen`, but has **no visual affordance** — nothing signals it's tappable.

**Fix:** Add a trailing `Icons.chevron_right` (matching the style used elsewhere in the app for navigable rows), and ensure the `InkWell` has a visible splash/highlight color so the tap ripple is perceptible.

---

## 8. Admin Override — Pin a Brand to a Fixed Position in "All Restaurants" (Sorted by Monthly Redemptions)

**Important distinction found during research** — there are two separate brand listings on the home screen:
1. **"Top Brands" grid** (`home_sheet_content.dart` ~line 547, backend `getAllBrands()` in `merchants.service.ts` lines 343-391) — already sorted by `merchants.featured_order` (admin-settable 1-6 via existing `PUT /merchants/brands/featured`), then alphabetical. **This already has the requested pin feature.**
2. **"All Restaurants" list** (`home_sheet_content.dart` ~line 691, backend `getAllMerchantsForStudents()` in `merchants.service.ts` lines 397-516) — sorted purely by `totalRedemptions` this month, **no override exists**.

The user's request is about list #2.

**Plan:**
- Add a new nullable column to `merchants`, e.g. `restaurant_list_pinned_position` (int), distinct from `featured_order` (which drives the unrelated Top Brands grid and is capped 1-6).
- In `getAllMerchantsForStudents()`: compute the redemption-count sort as today, then do a second pass — pull out any merchant with a non-null `restaurant_list_pinned_position`, and re-insert it at that 1-based index in the final list, shifting others down.
- Admin UI: in the admin merchants/brand-portfolio page, add a "Pin position (All Restaurants)" number input per merchant, calling a new endpoint e.g. `PUT /admin/merchants/:id/pinned-position`.

---

## 9. Items Owned by Aawaiz (handoff — no action needed here)
For visibility/cross-checking only, to avoid duplicate work:
- **Redemptions openable** — likely overlaps with item 7 above; confirm scope with Aawaiz before starting item 7 to avoid duplicate effort.
- **Notifications openable** — likely overlaps with item 4 above; confirm scope before starting item 4.
- **Card flipping should be known to user** — UI affordance for an existing flip-card interaction; Aawaiz-owned, no plan needed from this side.

---

## Verification Checklist

| Item | How to verify |
|------|--------------|
| Counter resync migration | Pick a known-drifted student (14th St Pizza redeemer) — compare `students.lifetime_redemptions`/`student_branch_stats` before/after script run against a manual `COUNT(*)` from `redemptions` |
| Rejection `student_offer_stats` fix | Reject a redemption, confirm `student_offer_stats.redemption_count` decrements |
| QR vs manual parity audit | Perform one of each for the same student; diff branch dashboard, student app, admin students table, leaderboard |
| Notifications expandable | Tap a truncated notification — confirm it expands in place; confirm link still openable via separate CTA |
| Top weekly redeemers | Seed redemptions for a test student this week — confirm they appear in the new widget within the top N |
| Advanced filter builder | Reproduce "male IBA students who redeemed coffee offers last month" using the new UI — confirm result set matches a manual DB query |
| CSV export | Apply a filter combo, export, confirm CSV row count matches on-screen result count and columns are correct |
| Recent redemptions clickable | Open redemption history — confirm chevron + ripple are visible, tap opens detail screen |
| Brand pin position | Set a pin position 2 for a low-redemption brand — confirm it appears at position 2 in "All Restaurants" while others remain redemption-sorted |
