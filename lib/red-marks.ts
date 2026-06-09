/**
 * Red Mark calculations — exact Section 6 formula with per-category grace.
 *
 * Grace minutes are subtracted from raw lateness/earliness BEFORE
 * applying the 15/30/30+ bands. So a Manager with 10-min grace who
 * arrives 12 min late = effectively 2 min late = 1 red mark.
 *
 * Bands themselves stay universal per spec § 6. Only the grace lever
 * is per-category (Option A).
 */

/** Morning: minutes late after shift start → red marks */
export function morningRedMarks(minutesLate: number, graceMinutes: number = 0): number {
  const effectiveLate = minutesLate - graceMinutes;
  if (effectiveLate <= 0) return 0;
  if (effectiveLate <= 15) return 1;
  if (effectiveLate <= 30) return 2;
  return 3;
}

/** Evening: minutes early before shift end → red marks */
export function eveningRedMarks(minutesEarly: number, graceMinutes: number = 0): number {
  const effectiveEarly = minutesEarly - graceMinutes;
  if (effectiveEarly <= 0) return 0;
  if (effectiveEarly <= 15) return 1;
  if (effectiveEarly <= 30) return 2;
  return 3;
}

/**
 * Monthly deduction in days from total red marks.
 * Tiered formula — Section 6:
 *   1–6  marks: every 3 marks = 0.5 day
 *   7–12 marks: every 3 marks = 1.0 day
 *   >12  marks: every 1 mark  = 0.5 day
 */
export function redMarkDeductionDays(totalMarks: number): number {
  if (totalMarks <= 0) return 0;
  let days = 0;

  // Tier 1: marks 1-6
  const tier1 = Math.min(totalMarks, 6);
  days += Math.floor(tier1 / 3) * 0.5;

  if (totalMarks > 6) {
    // Tier 2: marks 7-12
    const tier2 = Math.min(totalMarks - 6, 6);
    days += Math.floor(tier2 / 3) * 1.0;
  }

  if (totalMarks > 12) {
    // Tier 3: each mark beyond 12 = 0.5 day
    const tier3 = totalMarks - 12;
    days += tier3 * 0.5;
  }

  return days;
}

/** Deduction in ₹ given daily salary rate */
export function redMarkDeductionRupees(totalMarks: number, dailySalaryRate: number): number {
  return redMarkDeductionDays(totalMarks) * dailySalaryRate;
}
