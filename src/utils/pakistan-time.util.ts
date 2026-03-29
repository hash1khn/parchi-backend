/** Pakistan Standard Time (PKT) — Asia/Karachi, fixed UTC+5 (no DST). */

export const PAKISTAN_TIMEZONE = 'Asia/Karachi';
const PKT_UTC_OFFSET = '+05:00';

export function getPakistanCalendarDate(d: Date): {
  y: number;
  m: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAKISTAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { y, m, day };
}

function getYmdInPakistan(d: Date): { y: number; m: number; day: number } {
  return getPakistanCalendarDate(d);
}

/** Wall-clock time in Pakistan → UTC instant. */
export function zonedWallTimePakistanToUtc(
  y: number,
  m: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(ms).padStart(3, '0')}${PKT_UTC_OFFSET}`;
  return new Date(iso);
}

/** Start of calendar day 00:00:00.000 PKT for the Pakistan calendar date of `d`. */
export function startOfPakistanDay(d: Date): Date {
  const { y, m, day } = getYmdInPakistan(d);
  return zonedWallTimePakistanToUtc(y, m, day, 0, 0, 0, 0);
}

/** End of calendar day 23:59:59.999 PKT for the Pakistan calendar date of `d`. */
export function endOfPakistanDay(d: Date): Date {
  const { y, m, day } = getYmdInPakistan(d);
  return zonedWallTimePakistanToUtc(y, m, day, 23, 59, 59, 999);
}

/** Yesterday’s [start, end] in PKT relative to `d`’s Pakistan calendar “today”. */
export function pakistanYesterdayRange(d: Date): {
  start: Date;
  end: Date;
} {
  const startToday = startOfPakistanDay(d);
  const endYesterday = new Date(startToday.getTime() - 1);
  return {
    start: startOfPakistanDay(endYesterday),
    end: endYesterday,
  };
}

/** Hour 0–23 in PKT for this instant. */
export function getHourInPakistan(d: Date): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: PAKISTAN_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  return Number(parts.find((p) => p.type === 'hour')?.value);
}

/** Pakistan calendar date of `d`, plus `deltaDays` (calendar days in PKT). */
export function addPakistanCalendarDays(
  d: Date,
  deltaDays: number,
): { y: number; m: number; day: number } {
  const { y, m, day } = getYmdInPakistan(d);
  const noon = zonedWallTimePakistanToUtc(y, m, day, 12, 0, 0, 0);
  const shifted = new Date(
    noon.getTime() + deltaDays * 24 * 60 * 60 * 1000,
  );
  return getYmdInPakistan(shifted);
}
