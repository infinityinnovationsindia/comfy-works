
/**
 * Leave Calculator
 * - Sandwich rule (location-specific holiday calendar)
 * - PL accrual
 * - Notice period check
 */

export interface HolidayRecord {
  date: string; // 'YYYY-MM-DD'
  name: string;
  calendar_type: 'Factory' | 'Showroom';
}

export interface SandwichResult {
  totalCalendarDays: number;    // all days from→to inclusive
  workingDays: number;          // non-holiday, non-Sunday days
  sandwichedHolidays: string[]; // holiday names sandwiched in period
  plToDeduct: number;           // total PL consumed (sandwich rule: all calendar days)
  breakdown: Array<{ date: string; dayName: string; isHoliday: boolean; holidayName?: string; isSunday: boolean }>;
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Sandwich rule: ALL calendar days between from→to count as leave consumed.
 * Cross-references the employee's location-specific holiday calendar.
 */
export function calculateSandwich(
  fromDate: string,
  toDate: string,
  holidays: HolidayRecord[],
  employeeLocation: string
): SandwichResult {
  const calType = employeeLocation === 'Showroom' ? 'Showroom' : 'Factory';
  const relevantHolidays = new Map(
    holidays
      .filter(h => h.calendar_type === calType)
      .map(h => [h.date, h.name])
  );

  const from = new Date(fromDate + 'T00:00:00Z');
  const to   = new Date(toDate   + 'T00:00:00Z');

  const breakdown: SandwichResult['breakdown'] = [];
  const sandwichedHolidays: string[] = [];
  let workingDays = 0;

  const cur = new Date(from);
  while (cur <= to) {
    const ymd      = toYMD(cur);
    const dayOfWeek = cur.getUTCDay();
    const isSunday  = dayOfWeek === 0;
    const holidayName = relevantHolidays.get(ymd);
    const isHoliday  = isSunday || !!holidayName;

    if (isHoliday && holidayName && !isSunday) {
      sandwichedHolidays.push(holidayName);
    } else if (isSunday) {
      sandwichedHolidays.push('Sunday');
    }

    if (!isHoliday) workingDays++;

    breakdown.push({
      date: ymd,
      dayName: DAY_NAMES[dayOfWeek],
      isHoliday,
      holidayName: holidayName || (isSunday ? 'Sunday' : undefined),
      isSunday,
    });

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const totalCalendarDays = breakdown.length;
  // Sandwich rule: ALL calendar days consumed as PL
  const plToDeduct = totalCalendarDays;

  return { totalCalendarDays, workingDays, sandwichedHolidays, plToDeduct, breakdown };
}

/**
 * Check notice period violation.
 * Full day PL/UL: must apply 3+ days before.
 * Half day HPL/HUL: must apply 24+ hrs before.
 */
export function hasNoticeViolation(leaveType: string, fromDate: string, applyDate: string = new Date().toISOString().split('T')[0]): boolean {
  const from  = new Date(fromDate  + 'T00:00:00Z');
  const apply = new Date(applyDate + 'T00:00:00Z');
  const diffDays = (from.getTime() - apply.getTime()) / (1000 * 60 * 60 * 24);

  if (['PL', 'UL'].includes(leaveType)) {
    return diffDays < 3;
  }
  if (['HPL', 'HUL'].includes(leaveType)) {
    return diffDays < 1;
  }
  return false;
}

/**
 * Check retroactive: leave applied after leave date.
 */
export function isRetroactive(fromDate: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return fromDate < today;
}

/**
 * Monthly PL accrual for one employee.
 * Permanent: 1 PL per 20 working days attended.
 * Probationer: 1 PL per 30 working days attended.
 * Returns PL to ADD to balance.
 */
export function calculateAccrual(
  employmentType: string,
  daysAttendedThisMonth: number,
  currentPLEarned: number
): number {
  const maxPL = 15;
  const rate = employmentType === 'Permanent' ? 20 : 30;
  const earned = daysAttendedThisMonth / rate;
  const newTotal = currentPLEarned + earned;
  // Cap at 15 PL per financial year
  return Math.min(newTotal, maxPL) - currentPLEarned;
}
