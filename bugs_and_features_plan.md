# Parchi Bug Fixes & Feature Plan

## Context
A backlog of reported bugs and new features spanning the admin dashboard, branch dashboard, and student Flutter app. Items range from trivial UI fixes to a new heavyweight feature (student selfie change requests). One item (signup dropoff audit) is delegated to Umer and is noted for a handoff conversation.

---

## 1. Search Bar Bugs — Student KYC & All Students Tabs
**Files:** `dashboards/components/admin-kyc.tsx`, `dashboards/components/admin-students.tsx`

Both search bars use a debounced state → server-side query pattern. Audit each for:
- State not resetting when switching tabs (stale `searchQuery` bleeding between pending/all tabs)
- Debounce timer not cancelling on unmount, causing race conditions
- Missing `useEffect` cleanup
- Input becoming uncontrolled after filter resets

**Fix:** Ensure `searchQuery` resets to `""` when tabs change, add cleanup to debounce `useEffect`, and confirm the controlled input is always bound to the current state value.

---

## 2. Admin All-Branch QR — Flip Branch & Brand Names
**File:** `dashboards/components/admin-qr-codes.tsx` lines 77–79

Currently:
- `CardTitle` → `branch.branch_name` (the location name)
- `CardDescription` → `branch.merchant?.business_name` (the brand)

The brand should be the primary title and the branch name the subtitle. Swap these two.

---

## 3. Admin KYC Institute Dropdown — Mobile Responsiveness
**File:** `dashboards/components/admin-kyc.tsx` lines 322–361

The `Popover + Command` pattern doesn't work well on mobile (popover clips, text is tiny, tap targets are too small). On mobile:
- Replace/wrap the Popover with a native `<select>` or a bottom-sheet style `Sheet` component
- Or add responsive classes so the dropdown renders full-width and with larger tap targets on small screens
- Ensure the whole KYC filter toolbar stacks vertically and is scrollable on mobile viewports

---

## 4. 5th Bonus Triggers Count — Recalculate
**Files:** `dashboards/components/admin-redemption-engine.tsx`, backend redemption analytics service

The `totalBonusTriggers` in `fifthBonusStats` is inflating beyond the real count. Audit the backend SQL/Prisma query that produces this number:
- Check if it is counting all redemptions divisible by 5 vs. only the *specific* 5th-in-sequence events
- Check for off-by-one (e.g., 0-indexed counting leading to 4th being treated as 5th)
- Check if the query double-counts when a student has bonus redemptions across multiple branches
- Fix the query so it returns only the actual number of times a student's running total crossed a multiple-of-5 threshold

---

## 5. Signup Dropoff Audit
**Status: Done (June 2026)** — See [`docs/SIGNUP_DROPOFF_AUDIT.md`](docs/SIGNUP_DROPOFF_AUDIT.md). DB-state funnel is source of truth; event chart deprecated; Flutter verification event deduped.

---

## 6. MoM Growth Stat — Fix +/- Display
**File:** `dashboards/components/admin-dashboard.tsx` lines 733, 740

Current code hardcodes a `+` prefix:
```
`+${stats?.platformOverview?.totalActiveStudentsGrowth || 0}% MoM Growth`
```
If the value is negative (e.g. `-3`), this renders `+-3%`.

**Fix:** Conditionally prepend `+` only when value > 0:
```ts
const fmt = (v: number) => `${v > 0 ? "+" : ""}${v}%`
```
Apply to both `totalActiveStudentsGrowth` and `totalVerifiedMerchantsGrowth` subtitles.

---

## 7. Suspended / Rejected Count — Live Count
**File:** `dashboards/components/admin-dashboard.tsx` line 770, backend `getAdminDashboardStats`

The `suspendedRejected` value is likely a cumulative/historical count rather than the current live total of accounts that are *currently* suspended or rejected. Audit the backend query:
- It should `WHERE verification_status IN ('rejected', 'suspended') AND is_deleted = false`
- It must NOT include previously-rejected accounts that have since been re-approved
- If the current query is additive/historical, rewrite it as a point-in-time count

---

## 8. Admin Notifications — Filter Individual Redemption Notifications
**File:** `dashboards/components/admin-notifications.tsx`

In the History tab (lines 467–602) and Queue tab (lines 346–464), add a filter dropdown/toggle to show/hide individual redemption-triggered notifications vs. broadcast notifications. Use a `type` field (already expected to exist on notification records) to group and filter.

---

## 9. Push Notification — Two-Step Confirmation + Preview
**File:** `dashboards/components/admin-notifications.tsx` lines 65–344

Currently submitting the compose form fires `sendBroadcastNotification()` immediately with no confirmation. Add:
1. A `AlertDialog` confirmation step: after the user clicks "Send", show a modal summarising title, content, target audience, and estimated recipient count
2. Only on "Confirm Send" within that dialog does the actual API call fire
3. The preview should render the notification as it will appear on a phone (title + body + optional image thumbnail)

---

## 10. Branch Dashboard — QR Scan Should Show Verification Selfie
**File:** `dashboards/components/branch-dashboard.tsx` line 1113

Manual redemption correctly uses `studentDetails.verificationSelfie` (line 881). The QR redemption dialog uses `activeQrRequest.student.profilePicture` instead.

**Fix:**
- Check if `verificationSelfie` is returned in the QR request payload from `getPendingQrRequests()` (backend `GET /branch/qr-requests`)
- If not included: add `verification_selfie_path` to the backend's QR request response DTO
- Update line 1113 from `profilePicture` → `verificationSelfie`

---

## 11. All Students Directory Modal — Wider
**File:** `dashboards/components/student-profile-modal.tsx` line ~240

Current: `className="max-w-4xl max-h-[95vh] overflow-y-auto p-0 gap-0"`

Increase to `max-w-6xl` (or `max-w-[90vw]` for fluid width on large monitors) so admins can see table columns without horizontal scrolling. Verify the inner content layout doesn't break at the wider size.

---

## 12. Student Selfie Change Requests (Heavy Feature)
This is a multi-part feature spanning Flutter, Next.js dashboard, and backend.

### 12a. Stop Deleting Student ID Card on KYC Approval
**File:** `parchi-backend/src/modules/students/admin-students.controller.ts` lines 146–167

Confirm no deletion of `student_id_card_front_path` / `student_id_card_back_path` happens at approval time. If files are being cleaned from Supabase storage, remove that logic. The ID card front must persist for future selfie-change review.

### 12b. Student App — Submit Selfie Change Request
**Files:** Flutter app, new screen or modal

Students should be able to upload a new selfie from their profile settings. On submission:
- POST to new endpoint `POST /students/selfie-change-request` with the new selfie file
- Backend creates a `selfie_change_requests` record: `student_id`, `new_selfie_path`, `status (pending)`, `created_at`
- Show pending state in the app so student knows it's under review

### 12c. Backend — Selfie Change Request Model & Endpoints
New Prisma model:
```prisma
model SelfieChangeRequest {
  id              String   @id @default(uuid())
  student_id      String
  new_selfie_path String
  status          String   @default("pending") // pending | approved | rejected
  admin_note      String?
  created_at      DateTime @default(now())
  resolved_at     DateTime?
  student         Student  @relation(fields: [student_id], references: [id])
}
```

Admin endpoints:
- `GET /admin/selfie-change-requests` — list pending requests
- `PUT /admin/selfie-change-requests/:id/resolve` — approve or reject

On approve: swap `students.verification_selfie_path` to the new path.

### 12d. Admin UI — Selfie Change Request Review
**File:** New tab in `admin-kyc.tsx` or a new component

Show a list/card view of pending selfie change requests with:
- Old selfie (current `verification_selfie_path`) on the left
- New selfie (proposed) on the right
- Student ID card front below (from `student_kyc.student_id_card_front_path`) for cross-reference
- Approve / Reject buttons with optional note

---

## 13. Student App Leaderboard — Monthly Tab
**File:** `Parchi-Flutter/parchi_student_app/lib/screens/leaderboard/leaderboard_screen.dart`

Add a `TabBar` with two tabs: **All Time** (existing) and **Monthly** (new).

Backend requirement: `GET /leaderboard` needs a `?period=monthly` query param that filters to the current calendar month's redemption counts. Add this param to `LeaderboardService.getLeaderboard()` and pass it from the new tab.

Flutter changes:
- Wrap existing content in a `TabBarView`
- Monthly tab mirrors all-time structure but fetches with period filter
- The sticky "my rank" bar at the bottom should reflect the rank for whichever tab is active

---

## Verification Checklist

| Item | How to verify |
|------|--------------|
| Search bars | Type in search on KYC pending tab, switch to all-students tab — confirm search resets; confirm no stale results on fast typing |
| QR card flip | Open All Branch QR — brand name should now be the large title |
| MoM growth | Set growth to a negative value in test data — confirm display shows `-X%` not `+-X%` |
| Suspended/rejected | Compare dashboard count against a direct DB count of `WHERE verification_status IN ('rejected','suspended')` |
| Notifications filter | Post a redemption notification, open history tab, confirm filter hides/shows it |
| Push notification preview | Compose a notification and click Send — confirm dialog appears with content preview before dispatch |
| QR selfie | Perform a QR redemption at a branch — confirm verification selfie (not profile pic) is shown |
| Wider modal | Open any student in All Students — confirm wider layout with less/no horizontal scroll |
| Selfie change request | Student submits new selfie → admin sees old/new side-by-side → approve → student's selfie updates |
| Monthly leaderboard | Open leaderboard in app — confirm two tabs, monthly shows this-month rankings only |
