
/**
 * Attendance Processor
 * Converts raw attendance_punches → attendance_daily records.
 * Implements exact logic from Section 5 + 6 of spec.
 */
import { createClient } from '@supabase/supabase-js';
import { morningRedMarks, eveningRedMarks } from './red-marks';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function toIST(utcDate: string | Date): Date {
  const d = new Date(utcDate);
  // IST = UTC + 5:30
  return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
}

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseShiftMinutes(timeStr: string): number {
  // timeStr: "08:00:00"
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Process attendance for ALL employees for a specific date (IST).
 * Date format: 'YYYY-MM-DD' in IST
 */
export async function processDateAttendance(dateIST: string): Promise<{
  processed: number;
  errors: string[];
}> {
  const supabase = adminClient();
  const errors: string[] = [];

  // 1. Load all active employees with their shifts
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, employee_no, employment_type, location, shift_id, status, date_of_joining, reporting_manager_id, daily_salary_rate')
    .eq('status', 'Active');

  if (empErr || !employees) {
    return { processed: 0, errors: ['Failed to load employees: ' + empErr?.message] };
  }

  // 2. Load all shifts
  const { data: shifts } = await supabase.from('shifts').select('*');
  const shiftMap = new Map((shifts ?? []).map(s => [s.id, s]));

  // 3. Load holiday calendars
  const { data: holidays } = await supabase.from('holidays').select('date, calendar_type, name');
  const factoryHolidays = new Set((holidays ?? []).filter(h => h.calendar_type === 'Factory').map(h => h.date));
  const showroomHolidays = new Set((holidays ?? []).filter(h => h.calendar_type === 'Showroom').map(h => h.date));

  // 4. Load all punches for this date (IST date = UTC date-1 evening to date evening)
  // Date in IST: get UTC range
  const dayStartUTC = new Date(dateIST + 'T00:00:00+05:30').toISOString();
  const dayEndUTC   = new Date(dateIST + 'T23:59:59+05:30').toISOString();

  const { data: allPunches } = await supabase
    .from('attendance_punches')
    .select('employee_id, punched_at, punch_type')
    .gte('punched_at', dayStartUTC)
    .lte('punched_at', dayEndUTC)
    .order('punched_at', { ascending: true });

  // Group punches by employee
  const punchMap = new Map<string, Array<{ punched_at: string; punch_type: string }>>();
  (allPunches ?? []).forEach(p => {
    if (!punchMap.has(p.employee_id)) punchMap.set(p.employee_id, []);
    punchMap.get(p.employee_id)!.push(p);
  });

  // 5. Load approved leave requests covering this date
  const { data: leaveRequests } = await supabase
    .from('leave_requests')
    .select('employee_id, leave_type, half_day_type, date_from, date_to, status')
    .in('status', ['Approved'])
    .lte('date_from', dateIST)
    .gte('date_to', dateIST);

  const leaveMap = new Map<string, typeof leaveRequests>();
  (leaveRequests ?? []).forEach(lr => {
    if (!leaveMap.has(lr.employee_id)) leaveMap.set(lr.employee_id, []);
    leaveMap.get(lr.employee_id)!.push(lr);
  });

  let processed = 0;

  for (const emp of employees) {
    try {
      const shift = shiftMap.get(emp.shift_id);
      if (!shift) continue; // Skip employees with no shift assigned

      const isHolidayDate = emp.location === 'Showroom'
        ? showroomHolidays.has(dateIST)
        : factoryHolidays.has(dateIST);

      const punches = punchMap.get(emp.id) ?? [];
      const empLeaves = leaveMap.get(emp.id) ?? [];

      const result = processEmployeeDay({
        employee: emp,
        shift,
        dateIST,
        punches,
        approvedLeaves: empLeaves,
        isHolidayDate,
      });

      // Upsert attendance_daily record
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

      if (upsertErr) {
        errors.push(`${emp.employee_no}: ${upsertErr.message}`);
      } else {
        processed++;
      }

    } catch (e: any) {
      errors.push(`${emp.employee_no}: ${e.message}`);
    }
  }

  // 6. End-of-day: flag AAA_PENDING → notify supervisors
  if (new Date().toISOString() > new Date(dateIST + 'T20:30:00+05:30').toISOString()) {
    await flagAAAForDate(dateIST, supabase);
  }

  return { processed, errors };
}

function processEmployeeDay(params: {
  employee: any;
  shift: any;
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
  const { employee, shift, dateIST, punches, approvedLeaves, isHolidayDate } = params;

  // Holiday takes highest priority
  if (isHolidayDate) {
    return { status: 'H', checkIn: null, checkOut: null, hoursWorked: null, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  // Check approved leave for this date
  const approvedLeave = approvedLeaves.find(l =>
    l.date_from <= dateIST && l.date_to >= dateIST
  );
  if (approvedLeave) {
    return {
      status: approvedLeave.leave_type,
      checkIn: null, checkOut: null, hoursWorked: null,
      redMarksMorning: 0, redMarksEvening: 0,
      leaveId: approvedLeave.id ?? null,
    };
  }

  // Approved LC or EG for this date
  const approvedLC = approvedLeaves.find(l => l.leave_type === 'LC' && l.date_from === dateIST);
  const approvedEG = approvedLeaves.find(l => l.leave_type === 'EG' && l.date_from === dateIST);

  // No punches
  if (punches.length === 0) {
    return { status: 'AAA_PENDING', checkIn: null, checkOut: null, hoursWorked: null, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  // Single punch → Absent (A)
  if (punches.length === 1) {
    const singlePunch = punches[0].punched_at;
    return { status: 'A', checkIn: singlePunch, checkOut: null, hoursWorked: null, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  // 2+ punches
  const checkIn  = punches[0].punched_at;
  const checkOut = punches[punches.length - 1].punched_at;
  const hoursWorked = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60);

  // Less than 5 hours without approved leave → AA
  if (hoursWorked < 5) {
    return { status: 'AA', checkIn, checkOut, hoursWorked, redMarksMorning: 0, redMarksEvening: 0, leaveId: null };
  }

  // Calculate red marks
  const shiftStartMin = parseShiftMinutes(shift.start_time);
  const shiftEndMin   = parseShiftMinutes(shift.end_time);

  const checkInIST  = toIST(checkIn);
  const checkOutIST = toIST(checkOut);
  const checkInMin  = minutesSinceMidnight(checkInIST);
  const checkOutMin = minutesSinceMidnight(checkOutIST);

  const minsLate    = checkInMin - shiftStartMin;
  const minsEarly   = shiftEndMin - checkOutMin;

  let redMarksMorning = 0;
  let redMarksEvening = 0;

  // Morning red marks — only if no approved LC
  if (minsLate > 0 && !approvedLC) {
    redMarksMorning = morningRedMarks(minsLate);
  }

  // Evening red marks — only if no approved EG
  if (minsEarly > 0 && !approvedEG) {
    redMarksEvening = eveningRedMarks(minsEarly);
  }

  return {
    status: 'P',
    checkIn,
    checkOut,
    hoursWorked,
    redMarksMorning,
    redMarksEvening,
    leaveId: null,
  };
}

/** End-of-day: confirm AAA_PENDING → notify supervisors */
async function flagAAAForDate(dateIST: string, supabase: any) {
  const { data: pending } = await supabase
    .from('attendance_daily')
    .select('employee_id, employees(employee_no, first_name, last_name, reporting_manager_id)')
    .eq('date', dateIST)
    .eq('status', 'AAA_PENDING');

  if (!pending?.length) return;

  // Update to AAA
  await supabase
    .from('attendance_daily')
    .update({ status: 'AAA' })
    .eq('date', dateIST)
    .eq('status', 'AAA_PENDING');

  // TODO: notify supervisors via WhatsApp (Phase 2 notifications)
}
