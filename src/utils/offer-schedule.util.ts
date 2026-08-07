/**
 * Single source of truth for "is this offer redeemable right now?".
 *
 * Before this existed the schedule rules were enforced only when a redemption
 * was created, so the student app happily listed offers that were outside their
 * day/time window and the request failed after branch staff had already
 * approved it. Every surface that shows or accepts an offer must use these
 * helpers so display and enforcement can't drift apart.
 *
 * Times are evaluated in Pakistan Standard Time. `start_time` / `end_time` are
 * `TIME` columns written as literal wall-clock values (see convertTimeToDate in
 * offers.service), so they are read back with getUTC* and compared against the
 * PKT wall clock — never against the host's local clock.
 */

import {
  getDayOfWeekInPakistan,
  getMinutesOfDayInPakistan,
} from './pakistan-time.util';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** The subset of an offer this module needs. Structural so raw rows fit too. */
export interface SchedulableOffer {
  status?: string | null;
  valid_from?: Date | string | null;
  valid_until?: Date | string | null;
  schedule_type?: string | null;
  allowed_days?: number[] | null;
  start_time?: Date | string | null;
  end_time?: Date | string | null;
}

function toMinutesOfDay(t: Date | string): number {
  const d = t instanceof Date ? t : new Date(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function formatTime(t: Date | string): string {
  const d = t instanceof Date ? t : new Date(t);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Why the offer can't be redeemed at `now`, as a student-facing sentence,
 * or null when it is redeemable. Use this where you need to explain the
 * refusal; use isOfferLiveNow where you just need to filter.
 */
export function getOfferUnavailableReason(
  offer: SchedulableOffer,
  now: Date = new Date(),
): string | null {
  if (offer.status !== 'active') {
    return 'This offer is not active.';
  }

  if (offer.valid_from && new Date(offer.valid_from) > now) {
    return 'This offer has not started yet.';
  }
  if (offer.valid_until && new Date(offer.valid_until) < now) {
    return 'This offer has expired.';
  }

  // 'always' (and anything unset) has no further restrictions.
  if ((offer.schedule_type ?? 'always') !== 'custom') {
    return null;
  }

  const allowedDays = offer.allowed_days ?? [];
  if (allowedDays.length > 0) {
    const today = getDayOfWeekInPakistan(now);
    if (!allowedDays.includes(today)) {
      const available = allowedDays.map((d) => DAY_NAMES[d]).join(', ');
      return `This offer is not available on ${DAY_NAMES[today]}. It is only available on: ${available}`;
    }
  }

  const { start_time: startTime, end_time: endTime } = offer;
  if (startTime && endTime) {
    const current = getMinutesOfDayInPakistan(now);
    const start = toMinutesOfDay(startTime);
    const end = toMinutesOfDay(endTime);

    // An end before the start means the window wraps past midnight.
    const withinWindow =
      start <= end
        ? current >= start && current <= end
        : current >= start || current <= end;

    if (!withinWindow) {
      return `This offer is only available between ${formatTime(startTime)} and ${formatTime(endTime)}.`;
    }
  }

  return null;
}

/** True when the offer is active, in date range, and inside its schedule. */
export function isOfferLiveNow(
  offer: SchedulableOffer,
  now: Date = new Date(),
): boolean {
  return getOfferUnavailableReason(offer, now) === null;
}
