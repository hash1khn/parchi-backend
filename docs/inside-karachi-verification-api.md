# Inside Karachi - Parchi student verification API

Integration contract for applying a **Parchi student discount** at Inside Karachi (IK) checkout.

Parchi never sees payment details, ticket SKUs, or issued tickets. IK owns checkout end to end. Parchi only confirms that a verified student approved the request in the Parchi app.

## 1. Authentication

All partner endpoints require a **server-side** API key in a header. Never put the key in a browser, mobile bundle, or public repo. All calls must be made from the IK **backend** over HTTPS.

| Header | Value |
|---|---|
| `X-Partner-Key` | Raw partner key issued by Parchi (random, at least 32 characters) |
| `Content-Type` | `application/json` |

- Parchi stores only a SHA-256 hash of the key.
- A missing, wrong, or revoked key returns `401`. Repeated failures from one IP return `429`.
- **Rotation:** ask Parchi to rotate. Parchi swaps the hash; switch your configured key at the agreed time. A revoked key stays revoked until Parchi re-enables it.
- Treat `401` as a configuration problem (alert your team); do not retry in a loop.

```json
{ "statusCode": 401, "message": "Invalid partner API key", "error": "Unauthorized" }
```

## 2. Base URL

`https://<parchi-api-host>/v1/partners/verification-requests` (Parchi gives you the production and staging hosts).

## 3. Create a verification request

`POST /v1/partners/verification-requests`

Call from the IK backend when the shopper submits their Parchi ID at checkout.

### Request body

| Field | Type | Required | Rules |
|---|---|---|---|
| `parchiId` | string | yes | 1-10 letters/digits, e.g. `"48219"` |
| `externalReference` | string | yes | Your checkout/order id. Max 255 chars, no control characters. Used for idempotency. |
| `eventLabel` | string | no | Max 255 chars, no control characters. Shown to the student, e.g. `"Melbrew Live - 12 Oct"` |

```json
{
  "parchiId": "48219",
  "externalReference": "ik_order_98123",
  "eventLabel": "Melbrew Live - 12 Oct"
}
```

### Success `201`

```json
{
  "data": {
    "requestId": "c0a8012e-7b3a-4c11-9f0d-1b2c3d4e5f60",
    "status": "pending",
    "externalReference": "ik_order_98123",
    "eventLabel": "Melbrew Live - 12 Oct",
    "expiresAt": "2026-09-30T10:22:00.000Z",
    "createdAt": "2026-09-30T10:20:00.000Z",
    "approvedAt": null,
    "partnerName": "Inside Karachi",
    "matchCode": "37",
    "verifyDeepLink": "parchi://verify/c0a8012e-7b3a-4c11-9f0d-1b2c3d4e5f60",
    "verifyWebLink": "https://www.parchipakistan.com/verify/c0a8012e-7b3a-4c11-9f0d-1b2c3d4e5f60"
  },
  "status": 200,
  "message": "Verification request created"
}
```

(The HTTP status is `201`. The `status` field inside the body is a legacy field; use the HTTP status.)

### Idempotency and duplicates

- Same student + same `externalReference` while a request is still pending: Parchi returns the **existing** request (same `requestId`, same `matchCode`, same `201`). It is safe to retry on timeouts. If the first push notification had failed, the retry triggers another push attempt.
- A different `externalReference` for the same student while one is pending: the earlier request is marked `expired` and a new one is created.
- After a request expired, the same `externalReference` creates a **new** request (this is how "Resend" works).
- At most **5 new requests per student per 10 minutes**; beyond that you get `429`.

### Errors

| HTTP | When | What to do |
|---|---|---|
| `400` | Validation failed | Fix the request; do not retry unchanged |
| `401` | Bad, missing, or revoked key | Alert; do not retry |
| `403` | Student exists but is not verified, or account inactive | Tell the shopper they cannot use Parchi verification |
| `404` | No student with that Parchi ID | Ask the shopper to re-check the ID |
| `429` | Rate limit (per key, per student, or too many failed lookups) | Wait for `Retry-After` seconds, then retry with backoff |
| `5xx` | Parchi problem | Retry with exponential backoff (1s, 2s, 4s, max 3 tries); safe because of idempotency |

Do not show raw Parchi error messages to shoppers, and do not let shoppers probe Parchi IDs freely (rate limit your own endpoint). Parchi also limits failed lookups per key.

```json
{ "statusCode": 404, "message": "No student found with this Parchi ID", "error": "Not Found" }
```

## 4. Poll request status

`GET /v1/partners/verification-requests/:requestId`

Returns the same `data` object as create. `matchCode` is only present while `status` is `pending` (it is `null` afterwards).

| `status` | Meaning | Terminal |
|---|---|---|
| `pending` | Waiting for the student | no |
| `approved` | Student confirmed | yes |
| `rejected` | Student declined, or picked the wrong number (request cancelled) | yes |
| `expired` | Not answered within 2 minutes | yes |

Polling rules:

- Poll every **3 seconds**; after 30 seconds slow to every 5 seconds. Stop at the first terminal status, or at `expiresAt` plus a few seconds.
- A `pending` request expires **2 minutes** after creation. Expiry is decided by Parchi's server; do not rely on your own timer.
- Unknown request id, or an id that belongs to another partner: `404`.
- `429`: honor `Retry-After`. Limits are per API key (not per IP), sized for many concurrent checkouts.
- Once a terminal status is returned it never changes.

Apply the discount **only** on `approved`, tie it to your own order (`externalReference`), and use it once. Parchi does not track consumption; an `approved` request stays `approved`.

## 5. Checkout UX (required)

Show **all** of the following right after create:

1. Copy: **"Check your Parchi app"** (push notification, same phone).
2. The **`matchCode`** in large type, with copy like: **"Tap {matchCode} in your Parchi app"**. The student's app shows three numbers and must pick this one. This stops someone else's Parchi ID being approved by accident.
3. A **QR code** whose payload is exactly `verifyWebLink` (use the `https://` link, not `parchi://`), for shoppers checking out on a laptop. Scanning it in the Parchi app skips the number step because scanning proves the student is looking at your screen.

On `rejected` or `expired`, show a clear message and a **Resend** button (a new `POST` with the same `externalReference` creates a fresh request after expiry).

Never apply the discount from the Parchi ID alone. The ID is only a lookup; approval in the app is the proof.

## 6. Deep links

| Link | Use |
|---|---|
| `https://www.parchipakistan.com/verify/{requestId}` | QR payload and any "open in app" link. Opens the Parchi app (iOS Universal Link / Android App Link); otherwise opens the Parchi website. |
| `parchi://verify/{requestId}` | Custom scheme, also used inside push notifications. Prefer the https link for anything you render. |

Parchi never receives ticket or payment data. There is no "ticket purchased" callback.

## 7. Rate limits

| Scope | Limit |
|---|---|
| Create (per API key) | 120 requests / minute |
| Status polling (per API key) | 3000 requests / minute |
| New requests per student | 5 / 10 minutes |
| Failed Parchi ID lookups (per API key) | 30 / minute |
| Failed authentication (per IP) | 20 / minute |

Limits are per API key, not per IP. Ask Parchi if you expect more concurrent checkouts.

## 8. Security requirements for IK

- Keep `X-Partner-Key` on your backend only; rotate on any suspected exposure.
- Always use HTTPS; validate `requestId` as a UUID before using it.
- Do not log the key. Do not expose Parchi responses (or `matchCode`) to anyone but the shopper who started that checkout.
- Bind each `requestId` to a single order and consume it once.

## 9. Example flow

```
Shopper enters Parchi ID on IK checkout
  -> IK backend POST /v1/partners/verification-requests
  -> IK UI shows "Tap 37 in your Parchi app" + QR(verifyWebLink)
  -> Student taps the push (or scans the QR in the Parchi app)
  -> Student picks 37 (skipped when scanning) and confirms
  -> IK backend polls GET .../:requestId until approved
  -> IK applies the discount and charges
```
