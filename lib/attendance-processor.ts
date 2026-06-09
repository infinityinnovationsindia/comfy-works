/**
 * Attendance Processor
 * Converts raw attendance_punches → attendance_daily records.
 * Implements exact logic from Section 5 + 6 of spec.
 *
 * Reads per-employee rules from the `categories` table:
 *   - late_grace_minutes      → applied before red mark bands
 *   - early_grace_minutes     → applied before red mark bands
 *   - half_day_if_hours_below → AA threshold (hrs)
 *   - absent_if_hours_below   → A threshold (hrs, 0 = disabled)
 *
 * Employees without category_id fall back to safe defaults
 * (spec-aligned: 1 min grace, 5 hr half-day cutoff, no absent threshold).
 *
 * BIOMETRIC-EXEMPT EMPLOYEES (partners):
 *   Employees with is_biometric_exempt = true are NEVER flagged
 *   absent/half-day/red-marks. They get:
 *     - 'H' on holidays
 *     - leave_type on approved leave dates
 *     - 'P' on every other day
 *   Reason: partners don't punch the biometric machine.
 *
 * PUNCH CLUSTERING:
 *   Multiple punches within 60 seconds of each other are treated as
 *   a single logical punch (the device often registers a tap 2-3 times).
 *   We keep the first punch of each cluster.
 *
 * Reprocess support:
 *   - options.employeeIds     → process only these employees
 *   - options.preserveManuallyCorrected (default true)
 *                             → skip rows with is_manually_corrected = true
 *   - returns statusBefore + statusAfter counts
 */
import { createClient } from '@supabase/supabase-js';
import { morningRedMarks, eveningRedMarks } from './red-marks';

const DEFAULT_CATEGORY = {
  late_grace_minutes: 1,
  early_grace_minutes: 1,
  half_day_if_hours_below: 5,
  absent_if_hours_below: 0,
  half_day_unpaid: true,
  holiday_paid: false,
};

// Punch clustering window — taps within this many seconds are one event.
const PUNCH_CLUSTER_SECONDS = 60;

type CategoryRules = {
  late_grace_minutes: number;
  early_grace_minutes: number;
  half_day_if_hours_below: number;
  absent_if_hours_below: number;
  half_day_unpaid: boolean;
  holiday_paid: boolean;
};

export type ProcessOptions = {
  employeeIds?: string[];
  preserveManuallyCorrected?: boolean;
};

export type ProcessResult = {
  processed: number;
  skipped: number;
  errors: string[];
  statusBefore: Record<string, number>;
  statusAfter: Record<string, number>;
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function toIST(utcDate: string | Date): Date {
  const d = new Date(utcDate);
  return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseShiftMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Cluster a sorted list of punches: collapse any punches within
 * PUNCH_CLUSTER_SECONDS of the previous kept punch into one.
 */
function clusterPunches(
  punches: Array<{ punched_at: string; punch_type: string }>
): Array<{ punched_at: string; punch_type: string }> {
  if (punches.length <= 1) return punches;

  const out: typeof punches = [punches[0]];
  for (let i = 1; i < punches.length; i++) {
    const prevMs = new Date(out[out.length - 1].punched_at).getTime();
    const curMs  = new Date(punches[i].punched_at).getTime();
    const gapSec = (curMs - prevMs) / 1000;
    if (gapSec > PUNCH_CLUSTER_SECONDS) {
      out.push(punches[i]);
    }
    // else: same cluster, drop this duplicate
  }
  return out;
}

export async function processDateAttendance(
  dateIST: string,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const supabase = adminClient();
  const errors: string[] = [];
  const preserveManuallyCorrected = options.preserveManuallyCorrected !== false;

  // 1. Load employees (filter if employeeIds passed)
  let empQuery = supabase
    .from('employees')
    .select('id, employee_no, employment_type, location, shift_id, category_id, status, date_of_joining, reporting_manager_id, daily_salary_rate, is_biometric_exempt')
    .eq('status', 'Active');

  if (options.employeeIds && options.employeeIds.length > 0) {
    empQuery = empQuery.in('id', options.employeeIds);
  }

  const { data: employees, error: empErr } = await empQuery;
  if (empErr || !employees) {
    return {
      processed: 0,
      skipped: 0,
      errors: ['Failed to load employees: ' + empErr?.message],
      statusBefore: {},
      statusAfter: {},
    };
  }

  // 2. Capture statusBefore
  const empIds = employees.map(e => e.id);
  const statusBefore = await countStatusForScope(supabase, dateIST, empIds);

  // 3. Reference data
  const { data: shifts } = await supabase.from('shifts').select('*');
  const shiftMap = new Map((shifts ?? []).map(s => [s.id, s]));

  const { data: categories } = await supabase
    .from('categories')
    .select('id, late_grace_minutes, early_grace_minutes, half_day_if_hours_below, absent_if_hours_below, half_day_unpaid, holiday_paid')
    .eq('is_active', true);
  const categoryMap = new Map((categories ?? []).map(c => [c.id, c]));

  const { data: holidays } = await supabase.from('holidays').select('date, calendar_type, name');
  const factoryHolidays  = new Set((holidays ?? []).filter(h => h.calendar_type === 'Factory').map(h => h.date));
  const showroomHolidays = new Set((holidays ?? []).filter(h => h.calendar_type === 'Showroom').map(h => h.date));

  // 4. Manually-corrected rows
  const manuallyCorrectedIds = new Set<string>();
  if (preserveManuallyCorrected) {
    const { data: corrected } = await supabase
      .from('attendance_daily')
      .select('employee_id')
      .eq('date', dateIST)
      .eq('is_manually_corrected', true)
      .in('employee_id', empIds);
    (corrected ?? []).forEach(r => manuallyCorrectedIds.add(r.employee_id));
  }

  // 5. Punches (only for non-exempt employees — partners don't punch)
  const nonExemptEmpIds = employees.filter(e => !e.is_biometric_exempt).map(e => e.id);
  const dayStartUTC = new Date(dateIST + 'T00:00:00+05:30').toISOString();
  const dayEndUTC   = new Date(dateIST + 'T23:59:59+05:30').toISOString();

  const { data: allPunches } = nonExemptEmpIds.length > 0
    ? await supabase
        .from('attendance_punches')
        .select('employee_id, punched_at, punch_type')
        .gte('punched_at', dayStartUTC)
        .lte('punched_at', dayEndUTC)
        .in('employee_id', nonExemptEmpIds)
        .order('punched_at', { ascending: true })
    : { data: [] as Array<{ employee_id: string; punched_at: string; punch_type: string }> };

  const punchMap = new Map<string, Array<{ punched_at: string; punch_type: string }>>();
  (allPunches ?? []).forEach(p => {
    if (!punchMap.has(p.employee_id)) punchMap.set(p.employee_id, []);
    punchMap.get(p.employee_id)!.push(p);
  });

  // 6. Approved leaves
  const { data: leaveRequests } = await supabase
    .from('leave_requests')
    .select('id, employee_id, leave_type, half_day_type, date_from, date_to, status')
    .in('status', ['Approved'])
    .in('employee_id', empIds)
    .lte('date_from', dateIST)
    .gte('date_to', dateIST);

  const leaveMap = new Map<string, typeof leaveRequests>();
  (leaveRequests ?? []).forEach(lr => {
    if (!leaveMap.has(lr.employee_id)) leaveMap.set(lr.employee_id, []);
    leaveMap.get(lr.employee_id)!.push(lr);
  });

  let processed = 0;
  let skipped = 0;

  for (const emp of employees) {
    try {
      if (manuallyCorrectedIds.has(emp.id)) {
        skipped++;
        continue;
      }

      const category: CategoryRules = emp.category_id
        ? (categoryMap.get(emp.category_id) as CategoryRules) ?? DEFAULT_CATEGORY
        : DEFAULT_CATEGORY;

      const isHolidayDate = emp.location === 'Showroom'
        ? showroomHolidays.has(dateIST)
        : factoryHolidays.has(dateIST);

      const empLeaves = leaveMap.get(emp.id) ?? [];

      // ── BIOMETRIC-EXEMPT (partners): special-case handling ──
      if (emp.is_biometric_exempt) {
        const result = processExemptDay({
          dateIST,
          approvedLeaves: empLeaves,
          isHolidayDate,
        });
        const { error: upsertErr } = await supabase
          .from('attendance_daily')
          .upsert({
            employee_id:       emp.id,
            date:              dateIST,
            check_in:          null,
            check_out:         null,
            hours_worked:      null,
            status:            result.status,
            red_marks_morning: 0,
            red_marks_evening: 0,
            red_marks_total:   0,
            leave_id:          result.leaveId ?? null,
          }, { onConflict: 'employee_id,date', ignoreDuplicates: false });
        if (upsertErr) errors.push(`${emp.employee_no}: ${upsertErr.message}`);
        else processed++;
        continue;
      }

      // ── Non-exempt: normal flow ──
      const shift = shiftMap.get(emp.shift_id);
      if (!shift) continue;

      const rawPunches = punchMap.get(emp.id) ?? [];
      const punches = clusterPunches(rawPunches);

      const result = processEmployeeDay({
        employee: emp,
        shift,
        category,
        dateIST,
        punches,
        approvedLeaves: empLeaves,
        isHolidayDate,
      });

      const { error: upsertErr } = await supabase
        .from('attendance_daily')
        .upsert({
          employee_id:       emp.id,
          date:              dateIST,
          check_in:          result.checkIn,
          check_out:         result.checkOut,
          hours_worked:      result.hoursWorked,
          status:            result.status,
          red_marks_morning: result.redMarksMorning,
          red_marks_evening: result.redMarksEvening,
          red_marks_total:   result.redMarksMorning + result.redMarksEvening,
          leave_id:          result.leaveId ?? null,
        }, { onConflict: 'employee_id,date', ignoreDuplicates: false });

      if (upsertErr) errors.push(`${emp.employee_no}: ${upsertErr.message}`);
      else processed++;
    } catch (e: any) {
      errors.push(`${emp.employee_no}: ${e.message}`);
    }
  }

  // 7. Auto-promote AAA_PENDING → AAA (for historical or end-of-day)
  const nowAfterCutoff = new Date().toISOString() > new Date(dateIST + 'T20:30:00+05:30').toISOString();
  const isHistoricalDate = dateIST < new Date().toISOString().slice(0, 10);
  if (nowAfterCutoff || isHistoricalDate) {
    await flagAAAForDate(dateIST, supabase, empIds);
  }

  const statusAfter = await countStatusForScope(supabase, dateIST, empIds);

  return { processed, skipped, errors, statusBefore, statusAfter };
}

/**
 * Helper — count attendance_daily.status for given employees on a date.
 */
async function countStatusForScope(
  supabase: ReturnType<typeof adminClient>,
  dateIST: string,
  empIds: string[]
): Promise<Record<string, number>> {
  if (empIds.length === 0) return {};
  const { data } = await supabase
    .from('attendance_daily')
    .select('status')
    .eq('date', dateIST)
    .in('employee_id', empIds);

  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: any) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  });
  return counts;
}

/**
 * Exempt employees (partners) — never tracked by biometric.
 * Priority: Holiday > Approved Leave > P (present by default)
 */
function processExemptDay(params: {
  dateIST: string;
  approvedLeaves: any[];
  isHolidayDate: boolean;
}): { status: string; leaveId: string | null } {
  if (params.isHolidayDate) return { status: 'H', leaveId: null };

  const approvedLeave = params.approvedLeaves.find(l =>
    l.date_from <= params.dateIST && l.date_to >= params.dateIST &&
    !['LC', 'EG'].includes(l.leave_type)
  );
  if (approvedLeave) {
    return { status: approvedLeave.leave_type, leaveId: approvedLeave.id ?? null };
  }

  return { status: 'P', leaveId: null };
}

function processEmployeeDay(params: {
  employee: any;
  shift: any;
  category: CategoryRules;
  dateIST: string;
  punches: Array<{ punched_at: string; punch_type: string }>;
  approvedLeaves: any[];
  isHolidayDate: boolean;
}): {
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number | null;
  redMarksMorning: number;
  redMarksEvening: number;
  leaveId: string | null;
} {
  const { shift, category, dateIST, punches, approvedLeaves, isHolidayDate } = params;

  if (isHolidayDate) {
    return { status: 'H', checkIn: null, checkOut: null, hoursWorked: null, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  const approvedLeave = approvedLeaves.find(l =>
    l.date_from <= dateIST && l.date_to >= dateIST &&
    !['LC', 'EG'].includes(l.leave_type)
  );
  if (approvedLeave) {
    return {
      status: approvedLeave.leave_type,
      checkIn: null, checkOut: null, hoursWorked: null,
      redMarksMorning: 0, redMarksEvening: 0,
      leaveId: approvedLeave.id ?? null,
    };
  }

  const approvedLC = approvedLeaves.find(l => l.leave_type === 'LC' && l.date_from === dateIST);
  const approvedEG = approvedLeaves.find(l => l.leave_type === 'EG' && l.date_from === dateIST);

  if (punches.length === 0) {
    return { status: 'AAA_PENDING', checkIn: null, checkOut: null, hoursWorked: null, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  // Single (clustered) punch → A
  if (punches.length === 1) {
    return { status: 'A', checkIn: punches[0].punched_at, checkOut: null, hoursWorked: null, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  const checkIn  = punches[0].punched_at;
  const checkOut = punches[punches.length - 1].punched_at;
  const hoursWorked = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60);

  if (category.absent_if_hours_below > 0 && hoursWorked < category.absent_if_hours_below) {
    return { status: 'A', checkIn, checkOut, hoursWorked, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  if (category.half_day_if_hours_below > 0 && hoursWorked < category.half_day_if_hours_below) {
    return { status: 'AA', checkIn, checkOut, hoursWorked, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  const shiftStartMin = parseShiftMinutes(shift.start_time);
  const shiftEndMin   = parseShiftMinutes(shift.end_time);

  const checkInIST  = toIST(checkIn);
  const checkOutIST = toIST(checkOut);
  const minsLate    = minutesSinceMidnight(checkInIST)  - shiftStartMin;
  const minsEarly   = shiftEndMin - minutesSinceMidnight(checkOutIST);

  let redMarksMorning = 0;
  let redMarksEvening = 0;
  if (minsLate > 0 && !approvedLC)  redMarksMorning = morningRedMarks(minsLate, category.late_grace_minutes);
  if (minsEarly > 0 && !approvedEG) redMarksEvening = eveningRedMarks(minsEarly, category.early_grace_minutes);

  return { status: 'P', checkIn, checkOut, hoursWorked, redMarksMorning, redMarksEvening, leaveId: null };
}

async function flagAAAForDate(dateIST: string, supabase: any, empIds?: string[]) {
  let query = supabase
    .from('attendance_daily')
    .update({ status: 'AAA' })
    .eq('date', dateIST)
    .eq('status', 'AAA_PENDING');

  if (empIds && empIds.length > 0) {
    query = query.in('employee_id', empIds);
  }
  await query;
}
