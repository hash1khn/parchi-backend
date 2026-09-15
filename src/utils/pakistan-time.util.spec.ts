import {
  endOfPakistanMonth,
  pakistanCalendarMonthRange,
  previousPakistanCalendarMonthRange,
  startOfPakistanMonth,
} from './pakistan-time.util';

describe('pakistan month helpers', () => {
  it('endOfPakistanMonth is last ms of the PKT calendar month', () => {
    // Mid Sep 2026 PKT
    const mid = new Date('2026-09-15T07:00:00.000Z');
    const end = endOfPakistanMonth(mid);
    // 30 Sep 2026 23:59:59.999 PKT = 30 Sep 2026 18:59:59.999 UTC
    expect(end.toISOString()).toBe('2026-09-30T18:59:59.999Z');
  });

  it('previousPakistanCalendarMonthRange from 1 Mar ? February', () => {
    // 1 Mar 2026 09:00 PKT = 1 Mar 2026 04:00 UTC
    const firstOfMarch = new Date('2026-03-01T04:00:00.000Z');
    const range = previousPakistanCalendarMonthRange(firstOfMarch);
    expect(range.year).toBe(2026);
    expect(range.month).toBe(2);
    expect(range.start.toISOString()).toBe(
      startOfPakistanMonth(new Date('2026-02-15T07:00:00.000Z')).toISOString(),
    );
    expect(range.end.toISOString()).toBe(
      endOfPakistanMonth(new Date('2026-02-15T07:00:00.000Z')).toISOString(),
    );
  });

  it('previousPakistanCalendarMonthRange from mid-Jan ? December prior year', () => {
    const midJan = new Date('2026-01-15T07:00:00.000Z');
    const range = previousPakistanCalendarMonthRange(midJan);
    expect(range.year).toBe(2025);
    expect(range.month).toBe(12);
  });

  it('pakistanCalendarMonthRange for Feb 2026', () => {
    const range = pakistanCalendarMonthRange(2026, 2);
    expect(range.start.toISOString()).toBe('2026-01-31T19:00:00.000Z'); // 1 Feb 00:00 PKT
    expect(range.end.toISOString()).toBe('2026-02-28T18:59:59.999Z'); // 28 Feb 23:59:59.999 PKT
  });
});
