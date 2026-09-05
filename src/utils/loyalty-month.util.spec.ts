import {
  isLoyaltyBonusVisit,
  monthlyPunchCardCurrent,
} from './loyalty-month.util';
import { startOfPakistanMonth } from './pakistan-time.util';

describe('loyalty month', () => {
  it('startOfPakistanMonth is the 1st at 00:00 PKT', () => {
    // 15 Sep 2026 12:00 PKT = 15 Sep 2026 07:00 UTC
    const midMonth = new Date('2026-09-15T07:00:00.000Z');
    const start = startOfPakistanMonth(midMonth);
    expect(start.toISOString()).toBe('2026-08-31T19:00:00.000Z'); // 1 Sep 00:00 PKT
  });

  it('the 5th visit this month unlocks the bonus; the 4th does not', () => {
    expect(isLoyaltyBonusVisit(4, 5)).toBe(false);
    expect(isLoyaltyBonusVisit(5, 5)).toBe(true);
    expect(isLoyaltyBonusVisit(6, 5)).toBe(false);
    expect(isLoyaltyBonusVisit(10, 5)).toBe(true);
  });

  it('punch card shows 2/5 then 5/5 on the bonus visit', () => {
    expect(monthlyPunchCardCurrent(2, 5)).toBe(2);
    expect(monthlyPunchCardCurrent(5, 5)).toBe(5);
    expect(monthlyPunchCardCurrent(6, 5)).toBe(1);
    expect(monthlyPunchCardCurrent(0, 5)).toBe(0);
  });
});
