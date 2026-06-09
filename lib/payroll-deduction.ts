/**
 * Red Mark Deduction Calculator
 *
 * Implements the Comfy red mark policy with two layers:
 *   1. Forgiveness threshold: monthly marks <= threshold → 0 deduction
 *   2. Spec formula: once over threshold, apply the full 3-band spec
 *      (including the marks that were below the threshold)
 *
 * Spec bands (configurable via payroll_settings):
 *   Band 1: marks 1-6   → every 3 marks = ½ day
 *   Band 2: marks 7-12  → every 3 marks = 1 day
 *   Band 3: marks 13+   → every 1 mark  = ½ day
 *
 * Per-employee override: if employee.red_mark_threshold_override is set,
 * that threshold is used instead of the global one.
 *
 * Worked examples (default settings, threshold=6):
 *   marks=0   → 0 days
 *   marks=6   → 0 days   (forgiven)
 *   marks=7   → 1 day    (1d band1)
 *   marks=9   → 2 days   (1d band1 + 1d band2)
 *   marks=12  → 3 days   (1d band1 + 2d band2)
 *   marks=15  → 4.5 days (1d band1 + 2d band2 + 1.5d band3)
 */

export type PayrollPolicy = {
  red_mark_threshold: number;
  band1_rate_days: number;
  band1_per_marks: number;
  band1_max_marks: number;
  band2_rate_days: number;
  band2_per_marks: number;
  band2_max_marks: number;
  band3_rate_days: number;
  band3_per_marks: number;
};

export const DEFAULT_PAYROLL_POLICY: PayrollPolicy = {
  red_mark_threshold: 6,
  band1_rate_days: 0.5,
  band1_per_marks: 3,
  band1_max_marks: 6,
  band2_rate_days: 1.0,
  band2_per_marks: 3,
  band2_max_marks: 12,
  band3_rate_days: 0.5,
  band3_per_marks: 1,
};

export type RedMarkDeductionResult = {
  deductionDays: number;
  reason: string;
  thresholdApplied: number;
  isOverride: boolean;
};

/**
 * Calculate deduction for an employee given their monthly red marks.
 *
 * @param monthlyMarks            Total red marks for the period
 * @param policy                  Current payroll policy settings
 * @param employeeOverride        Optional per-employee threshold override (null = use global)
 */
export function calculateRedMarkDeduction(
  monthlyMarks: number,
  policy: PayrollPolicy,
  employeeOverride: number | null = null
): RedMarkDeductionResult {
  const threshold = employeeOverride ?? policy.red_mark_threshold;
  const isOverride = employeeOverride != null && employeeOverride !== policy.red_mark_threshold;

  // No marks
  if (monthlyMarks === 0) {
    return {
      deductionDays: 0,
      reason: 'No marks',
      thresholdApplied: threshold,
      isOverride,
    };
  }

  // At or below threshold → forgiven
  if (monthlyMarks <= threshold) {
    return {
      deductionDays: 0,
      reason: isOverride
        ? `Below custom threshold (${threshold})`
        : `Below threshold (${threshold})`,
      thresholdApplied: threshold,
      isOverride,
    };
  }

  // Above threshold → apply full spec (bands accumulate from mark 1, not from threshold+1)
  const band1MarksCounted = Math.min(monthlyMarks, policy.band1_max_marks);
  const band1Days =
    Math.floor(band1MarksCounted / policy.band1_per_marks) * policy.band1_rate_days;

  const band2Range = policy.band2_max_marks - policy.band1_max_marks;
  const band2MarksCounted = Math.min(
    Math.max(0, monthlyMarks - policy.band1_max_marks),
    band2Range
  );
  const band2Days =
    Math.floor(band2MarksCounted / policy.band2_per_marks) * policy.band2_rate_days;

  const band3MarksCounted = Math.max(0, monthlyMarks - policy.band2_max_marks);
  const band3Days = band3MarksCounted * policy.band3_rate_days;

  const totalDays = band1Days + band2Days + band3Days;

  // Build the reason string
  const parts: string[] = [];
  if (band1Days > 0) {
    parts.push(`${formatDays(band1Days)} (1-${band1MarksCounted})`);
  }
  if (band2Days > 0) {
    const band2From = policy.band1_max_marks + 1;
    const band2To = policy.band1_max_marks + band2MarksCounted;
    parts.push(`${formatDays(band2Days)} (${band2From}-${band2To})`);
  }
  if (band3Days > 0) {
    const band3From = policy.band2_max_marks + 1;
    const band3To = policy.band2_max_marks + band3MarksCounted;
    parts.push(`${formatDays(band3Days)} (${band3From}-${band3To})`);
  }

  const prefix = isOverride
    ? `Above custom threshold (${threshold})`
    : `Above threshold (${threshold})`;

  const reason =
    parts.length > 0
      ? `${prefix}: ${parts.join(' + ')} = ${formatDays(totalDays)}`
      : `${prefix}: 0 days`;

  return {
    deductionDays: totalDays,
    reason,
    thresholdApplied: threshold,
    isOverride,
  };
}

/**
 * Format days as "1d" / "0.5d" / "2.5d" etc.
 */
function formatDays(days: number): string {
  // Strip trailing zeros: 1.0 → "1", 1.5 → "1.5"
  const formatted = days % 1 === 0 ? days.toFixed(0) : days.toFixed(1);
  return `${formatted}d`;
}

/**
 * Generate preview rows for the settings page.
 */
export function generatePreviewRows(
  policy: PayrollPolicy
): Array<{ marks: number; days: number; reason: string }> {
  const sampleMarks = [
    0, 3, 6, 7, 8, 9, 10, 12, 13, 15, 18, 21, 24,
  ];
  return sampleMarks.map((marks) => {
    const result = calculateRedMarkDeduction(marks, policy);
    return {
      marks,
      days: result.deductionDays,
      reason: result.reason,
    };
  });
}
