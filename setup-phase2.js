#!/usr/bin/env node
/**
 * Comfy Works — Phase 2 Setup Script
 * Writes every file for Phase 2: Daily Operations
 *
 * Run from C:\Users\Dell\comfy-works:
 *   node setup-phase2.js
 */
const fs = require('fs');
const path = require('path');

let created = 0;
function write(filePath, content) {
  const abs = path.join(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  console.log('✓', filePath);
  created++;
}

// ═══════════════════════════════════════════════════════════════
// LIB: RED MARKS — EXACT Section 6 formula
// ═══════════════════════════════════════════════════════════════
write('lib/red-marks.ts', `
/**
 * Red Mark calculations — exact Section 6 formula.
 * Never simplify these bands.
 */

/** Morning: minutes late after shift start → red marks */
export function morningRedMarks(minutesLate: number): number {
  if (minutesLate <= 0) return 0;
  if (minutesLate <= 15) return 1;
  if (minutesLate <= 30) return 2;
  return 3;
}

/** Evening: minutes early before shift end → red marks */
export function eveningRedMarks(minutesEarly: number): number {
  if (minutesEarly <= 0) return 0;
  if (minutesEarly <= 15) return 1;
  if (minutesEarly <= 30) return 2;
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
`);

// ═══════════════════════════════════════════════════════════════
// LIB: LEAVE CALCULATOR — Sandwich rule + accrual
// ═══════════════════════════════════════════════════════════════
write('lib/leave-calculator.ts', `
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
`);

// ═══════════════════════════════════════════════════════════════
// LIB: ATTENDANCE PROCESSOR — Core processing logic
// ═══════════════════════════════════════════════════════════════
write('lib/attendance-processor.ts', `
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
        errors.push(\`\${emp.employee_no}: \${upsertErr.message}\`);
      } else {
        processed++;
      }

    } catch (e: any) {
      errors.push(\`\${emp.employee_no}: \${e.message}\`);
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
`);

// ═══════════════════════════════════════════════════════════════
// LIB: WHATSAPP — Meta Cloud API with fallback
// ═══════════════════════════════════════════════════════════════
write('lib/whatsapp.ts', `
/**
 * WhatsApp notifications via Meta Cloud API.
 * Falls back to console.log if credentials not set.
 *
 * Setup:
 *   WHATSAPP_PHONE_NUMBER_ID=  (from Meta Developer console)
 *   WHATSAPP_ACCESS_TOKEN=     (System User token)
 *
 * Templates (submit these to Meta for approval):
 *   comfy_leave_approval   - to approver
 *   comfy_leave_decision   - to employee
 *   comfy_time_off_approved - to security
 *   comfy_on_duty_approved  - to security
 *   comfy_aaa_alert        - to Kush
 */

const META_API = 'https://graph.facebook.com/v19.0';

export type WATemplate =
  | 'comfy_leave_approval'
  | 'comfy_leave_decision'
  | 'comfy_time_off_approved'
  | 'comfy_on_duty_approved'
  | 'comfy_aaa_alert'
  | 'comfy_escalate_kush';

/**
 * Send a WhatsApp template message.
 * @param to   - phone number with country code, no '+': "919876543210"
 * @param template - template name approved by Meta
 * @param params   - body parameter values in order
 */
export async function sendWhatsApp(
  to: string,
  template: WATemplate,
  params: string[]
): Promise<{ success: boolean; error?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

  // Fallback: log to console if not configured
  if (!phoneNumberId || !accessToken) {
    console.log('[WhatsApp FALLBACK]', { to, template, params });
    return { success: true };
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: 'en' },
      components: [{
        type: 'body',
        parameters: params.map(text => ({ type: 'text', text: String(text) })),
      }],
    },
  };

  try {
    const res = await fetch(\`\${META_API}/\${phoneNumberId}/messages\`, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${accessToken}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[WhatsApp Error]', err);
      return { success: false, error: JSON.stringify(err) };
    }

    return { success: true };
  } catch (e: any) {
    console.error('[WhatsApp Exception]', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Notify leave approver (L1, L2, or L3).
 */
export async function notifyLeaveApprover(params: {
  approverPhone: string;
  employeeName: string;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  reason: string;
  plBalance: number;
  approveUrl: string;
}) {
  return sendWhatsApp(
    params.approverPhone,
    'comfy_leave_approval',
    [
      params.employeeName,
      params.leaveType,
      params.dateFrom,
      params.dateTo,
      String(params.days),
      params.reason.slice(0, 200),
      String(params.plBalance),
      params.approveUrl,
    ]
  );
}

/**
 * Notify employee of leave decision.
 */
export async function notifyEmployeeDecision(params: {
  employeePhone: string;
  leaveType: string;
  dateFrom: string;
  dateTo: string;
  decision: 'Approved' | 'Rejected';
  comment?: string;
}) {
  return sendWhatsApp(
    params.employeePhone,
    'comfy_leave_decision',
    [
      params.leaveType,
      params.dateFrom,
      params.dateTo,
      params.decision,
      params.comment ?? (params.decision === 'Approved' ? 'Your leave has been sanctioned.' : 'Contact HR for details.'),
    ]
  );
}

/** Alert Kush about AAA */
export async function notifyKushAAA(params: {
  kushPhone: string;
  employeeName: string;
  date: string;
}) {
  return sendWhatsApp(
    params.kushPhone,
    'comfy_aaa_alert',
    [params.employeeName, params.date]
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// LIB: APPROVAL TOKENS
// ═══════════════════════════════════════════════════════════════
write('lib/approval-tokens.ts', `
/**
 * Approval token generation and verification.
 * Tokens are stored in leave_requests.approval_token
 * and expire after 7 days.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export function generateToken(): string {
  return randomUUID().replace(/-/g, '') + Date.now().toString(36);
}

export async function getLeaveByToken(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabase
    .from('leave_requests')
    .select(\`
      *,
      employee:employee_id (first_name, last_name, employee_no, department, location),
      l1_approver:l1_approver_id (first_name, last_name),
      l2_approver:l2_approver_id (first_name, last_name),
      l3_approver:l3_approver_id (first_name, last_name)
    \`)
    .eq('approval_token', token)
    .single();

  if (error || !data) return null;

  // Token valid for 7 days from creation
  const created = new Date(data.created_at);
  const now = new Date();
  if ((now.getTime() - created.getTime()) > 7 * 24 * 60 * 60 * 1000) return null;

  return data;
}
`);

// ═══════════════════════════════════════════════════════════════
// LIB: APPROVAL ROUTING
// ═══════════════════════════════════════════════════════════════
write('lib/approval-routing.ts', `
/**
 * Determines approval chain for a leave request.
 * Factory production workers: Supervisor → Shailoo → Kush (3-step)
 * Design (Yash's team): Yash → Kush (2-step)
 * Site (Pradeep/Luv): their manager → Kush (2-step)
 * Showroom: Kiran → Kush (2-step)
 */
import { createClient } from '@supabase/supabase-js';

export interface ApprovalChain {
  chainType: '2step' | '3step';
  l1ApproverId: string;
  l2ApproverId: string;
  l3ApproverId?: string; // Only for 3-step (Kush)
}

const PARTNER_EMPLOYEE_NOS = {
  kush:    'CF-004',
  shailoo: 'CF-002',
  yash:    'CF-003',
  pradeep: 'CF-012',
  luv:     'CF-005',
  kiran:   'CF-031',
  neal:    'CF-080',
};

export async function resolveApprovalChain(employeeId: string): Promise<ApprovalChain | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Load employee + all partner IDs
  const { data: emp } = await supabase
    .from('employees')
    .select('id, location, department, reporting_manager_id')
    .eq('id', employeeId)
    .single();

  if (!emp) return null;

  // Load partner employee UUIDs by CF number
  const { data: partners } = await supabase
    .from('employees')
    .select('id, employee_no')
    .in('employee_no', Object.values(PARTNER_EMPLOYEE_NOS));

  if (!partners) return null;

  const byNo = new Map(partners.map(p => [p.employee_no, p.id]));
  const kushId    = byNo.get(PARTNER_EMPLOYEE_NOS.kush)!;
  const shailooId = byNo.get(PARTNER_EMPLOYEE_NOS.shailoo)!;
  const yashId    = byNo.get(PARTNER_EMPLOYEE_NOS.yash)!;
  const pradeepId = byNo.get(PARTNER_EMPLOYEE_NOS.pradeep)!;
  const luvId     = byNo.get(PARTNER_EMPLOYEE_NOS.luv)!;
  const kiranId   = byNo.get(PARTNER_EMPLOYEE_NOS.kiran)!;

  const repMgr = emp.reporting_manager_id;

  // Design team (reports to Yash)
  if (repMgr === yashId) {
    return { chainType: '2step', l1ApproverId: yashId, l2ApproverId: kushId };
  }

  // Site staff (reports to Pradeep or Luv)
  if (repMgr === pradeepId || repMgr === luvId) {
    return { chainType: '2step', l1ApproverId: repMgr, l2ApproverId: kushId };
  }

  // Showroom staff
  if (emp.location === 'Showroom') {
    return { chainType: '2step', l1ApproverId: kiranId, l2ApproverId: kushId };
  }

  // Factory production workers (3-step)
  if (emp.location === 'Factory') {
    const supervisorId = repMgr || shailooId;
    // If reporting manager IS Shailoo, they go directly Shailoo → Kush (2-step)
    if (supervisorId === shailooId) {
      return { chainType: '2step', l1ApproverId: shailooId, l2ApproverId: kushId };
    }
    // Otherwise: supervisor → Shailoo → Kush
    return {
      chainType: '3step',
      l1ApproverId: supervisorId,
      l2ApproverId: shailooId,
      l3ApproverId: kushId,
    };
  }

  // Default fallback: reporting manager → Kush
  return {
    chainType: '2step',
    l1ApproverId: repMgr || kushId,
    l2ApproverId: kushId,
  };
}
`);


// ═══════════════════════════════════════════════════════════════
// API: CRON — Process attendance daily
// ═══════════════════════════════════════════════════════════════
write('app/api/cron/process-attendance/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { processDateAttendance } from '@/lib/attendance-processor';

// Called daily by Vercel Cron or external trigger
// Add to vercel.json: { "crons": [{ "path": "/api/cron/process-attendance", "schedule": "30 18 * * *" }] }
// 18:30 UTC = midnight IST

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Process yesterday IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  istNow.setDate(istNow.getDate() - 1);
  const dateIST = istNow.toISOString().split('T')[0];

  const result = await processDateAttendance(dateIST);
  return NextResponse.json({ date: dateIST, ...result });
}

// Manual trigger with specific date
export async function POST(request: NextRequest) {
  const { date } = await request.json().catch(() => ({}));
  const dateIST = date ?? new Date().toISOString().split('T')[0];
  const result = await processDateAttendance(dateIST);
  return NextResponse.json({ date: dateIST, ...result });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: CRON — Monthly PL accrual (runs on 1st of each month)
// ═══════════════════════════════════════════════════════════════
write('app/api/cron/monthly-accrual/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateAccrual } from '@/lib/leave-calculator';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date();
  const fy = now.getMonth() >= 3
    ? \`\${now.getFullYear()}-\${String(now.getFullYear() + 1).slice(2)}\`
    : \`\${now.getFullYear() - 1}-\${String(now.getFullYear()).slice(2)}\`;

  // Get last month's date range
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const fromDate = lastMonth.toISOString().split('T')[0];
  const toDate   = lastMonthEnd.toISOString().split('T')[0];

  // Load all active employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employment_type, date_of_joining')
    .eq('status', 'Active');

  let updated = 0;

  for (const emp of (employees ?? [])) {
    // Count days attended last month (P status)
    const { count } = await supabase
      .from('attendance_daily')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', emp.id)
      .in('status', ['P', 'LC', 'EG'])
      .gte('date', fromDate)
      .lte('date', toDate);

    const daysAttended = count ?? 0;

    // Get current leave balance for this FY
    const { data: balance } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('financial_year', fy)
      .single();

    const currentEarned = balance?.pl_earned ?? 0;
    const toAdd = calculateAccrual(emp.employment_type, daysAttended, currentEarned);

    if (toAdd > 0) {
      await supabase
        .from('leave_balances')
        .upsert({
          employee_id: emp.id,
          financial_year: fy,
          pl_earned: currentEarned + toAdd,
          pl_used: balance?.pl_used ?? 0,
        }, { onConflict: 'employee_id,financial_year' });
      updated++;
    }
  }

  return NextResponse.json({ fy, fromDate, toDate, updated });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: CRON — Year-end PL lapse (April 1)
// ═══════════════════════════════════════════════════════════════
write('app/api/cron/year-end/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date();
  const prevFY = \`\${now.getFullYear() - 1}-\${String(now.getFullYear()).slice(2)}\`;
  const newFY  = \`\${now.getFullYear()}-\${String(now.getFullYear() + 1).slice(2)}\`;

  // Get all leave balances for previous FY with unused PL
  const { data: balances } = await supabase
    .from('leave_balances')
    .select('*, employee:employee_id(first_name, last_name, employee_no)')
    .eq('financial_year', prevFY)
    .gt('pl_balance', 0);

  const report = (balances ?? []).map(b => ({
    employee_no: b.employee?.employee_no,
    name: \`\${b.employee?.first_name} \${b.employee?.last_name}\`,
    unused_pl: b.pl_balance,
    lapsed: b.pl_balance, // NO encashment — permanent policy
  }));

  // Zero all balances for prev FY — balances lapse on March 31
  const empIds = (balances ?? []).map(b => b.employee_id);
  if (empIds.length > 0) {
    await supabase
      .from('leave_balances')
      .update({ pl_earned: 0, pl_used: 0 })
      .eq('financial_year', prevFY)
      .in('employee_id', empIds);
  }

  // Create new FY leave_balances for all active employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id')
    .eq('status', 'Active');

  const newRecords = (employees ?? []).map(e => ({
    employee_id: e.id,
    financial_year: newFY,
    pl_earned: 0,
    pl_used: 0,
  }));

  if (newRecords.length > 0) {
    await supabase
      .from('leave_balances')
      .upsert(newRecords, { onConflict: 'employee_id,financial_year', ignoreDuplicates: true });
  }

  // TODO: Send report to Kush via WhatsApp

  return NextResponse.json({
    message: 'Year-end processing complete. NO encashment — PL balances zeroed.',
    prevFY,
    newFY,
    employeesWithLapsedPL: report.length,
    report,
  });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: LEAVE — Sandwich calculation
// ═══════════════════════════════════════════════════════════════
write('app/api/leave/sandwich/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateSandwich } from '@/lib/leave-calculator';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fromDate   = searchParams.get('from')!;
  const toDate     = searchParams.get('to')!;
  const employeeId = searchParams.get('employeeId')!;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: emp } = await supabase
    .from('employees')
    .select('location')
    .eq('id', employeeId)
    .single();

  const { data: holidays } = await supabase
    .from('holidays')
    .select('date, name, calendar_type')
    .gte('date', fromDate)
    .lte('date', toDate);

  const result = calculateSandwich(fromDate, toDate, holidays ?? [], emp?.location ?? 'Factory');
  return NextResponse.json(result);
}
`);

// ═══════════════════════════════════════════════════════════════
// API: LEAVE — Balance
// ═══════════════════════════════════════════════════════════════
write('app/api/leave/balance/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId')!;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date();
  const fy = now.getMonth() >= 3
    ? \`\${now.getFullYear()}-\${String(now.getFullYear() + 1).slice(2)}\`
    : \`\${now.getFullYear() - 1}-\${String(now.getFullYear()).slice(2)}\`;

  const { data, error } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('financial_year', fy)
    .single();

  if (error) {
    return NextResponse.json({ pl_earned: 0, pl_used: 0, pl_balance: 0, financial_year: fy });
  }

  return NextResponse.json(data);
}
`);


// ═══════════════════════════════════════════════════════════════
// API: LEAVE — Apply (all 10 edge cases from Section 5.7)
// ═══════════════════════════════════════════════════════════════
write('app/api/leave/apply/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateSandwich, hasNoticeViolation, isRetroactive } from '@/lib/leave-calculator';
import { resolveApprovalChain } from '@/lib/approval-routing';
import { generateToken } from '@/lib/approval-tokens';
import { notifyLeaveApprover } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    employeeId, leaveType, halfDayType,
    dateFrom, dateTo, reason,
    outOfStation, outOfStationContact, outOfStationAddress,
    convertFromPL, // Edge case 1: convert PL→UL if balance=0
  } = body;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Load employee
  const { data: emp } = await supabase
    .from('employees')
    .select('id, first_name, last_name, employee_no, employment_type, location, phone')
    .eq('id', employeeId)
    .single();

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // ── EDGE CASE 2: Probationer applying PL ────────────────────
  if (leaveType === 'PL' && emp.employment_type === 'Probationer') {
    return NextResponse.json({
      error: 'PROBATIONER_PL_BLOCKED',
      message: 'PL cannot be used during probation. Apply for Unpaid Leave (UL) instead.',
      suggestion: 'UL',
    }, { status: 422 });
  }

  // Load current PL balance
  const now = new Date();
  const fy = now.getMonth() >= 3
    ? \`\${now.getFullYear()}-\${String(now.getFullYear() + 1).slice(2)}\`
    : \`\${now.getFullYear() - 1}-\${String(now.getFullYear()).slice(2)}\`;

  const { data: balance } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('financial_year', fy)
    .single();

  const plBalance = balance?.pl_balance ?? 0;

  // Load holidays for sandwich calculation
  const { data: holidays } = await supabase
    .from('holidays')
    .select('date, name, calendar_type')
    .gte('date', dateFrom)
    .lte('date', dateTo);

  const sandwich = calculateSandwich(dateFrom, dateTo, holidays ?? [], emp.location);
  const plToConsume = ['PL', 'HPL'].includes(leaveType)
    ? (leaveType === 'HPL' ? 0.5 : sandwich.plToDeduct)
    : 0;

  // ── EDGE CASE 1: PL balance = 0, employee applies PL ────────
  if (['PL', 'HPL'].includes(leaveType) && plBalance < plToConsume) {
    if (!convertFromPL) {
      return NextResponse.json({
        error: 'INSUFFICIENT_PL',
        message: \`PL balance (\${plBalance}) is insufficient for \${plToConsume} days. Convert to Unpaid Leave?\`,
        plBalance,
        plRequired: plToConsume,
        suggestion: leaveType === 'PL' ? 'UL' : 'HUL',
        salaryDeductionWarning: \`This will result in \${plToConsume} day(s) salary deduction.\`,
      }, { status: 422 });
    }
    // Employee confirmed conversion to UL — proceed with converted type
  }

  const finalLeaveType = (convertFromPL && ['PL','HPL'].includes(leaveType))
    ? (leaveType === 'PL' ? 'UL' : 'HUL')
    : leaveType;

  // ── EDGE CASE 4: Notice period violation ─────────────────────
  const noticeViolation = hasNoticeViolation(finalLeaveType, dateFrom);

  // ── EDGE CASE 8: Retroactive application ─────────────────────
  const retroactive = isRetroactive(dateFrom);

  // Resolve approval chain
  const chain = await resolveApprovalChain(employeeId);
  if (!chain) return NextResponse.json({ error: 'Could not determine approval chain' }, { status: 500 });

  // Generate one-tap approval token
  const approvalToken = generateToken();

  const approveUrl = \`\${process.env.NEXT_PUBLIC_APP_URL}/approve/\${approvalToken}\`;

  // Insert leave request
  const { data: leave, error: insertErr } = await supabase
    .from('leave_requests')
    .insert({
      employee_id:            employeeId,
      leave_type:             finalLeaveType,
      half_day_type:          halfDayType ?? null,
      date_from:              dateFrom,
      date_to:                dateTo,
      working_days_count:     sandwich.workingDays,
      pl_to_deduct:           plToConsume,
      reason,
      out_of_station:         outOfStation ?? false,
      out_of_station_contact: outOfStationContact ?? null,
      out_of_station_address: outOfStationAddress ?? null,
      notice_violation:       noticeViolation,
      is_retroactive:         retroactive,
      status:                 'Pending',
      l1_approver_id:         chain.l1ApproverId,
      l2_approver_id:         chain.l2ApproverId,
      l3_approver_id:         chain.chainType === '3step' ? chain.l3ApproverId : null,
      chain_type:             chain.chainType,
      approval_token:         approvalToken,
    })
    .select()
    .single();

  if (insertErr || !leave) {
    return NextResponse.json({ error: insertErr?.message }, { status: 500 });
  }

  // Load L1 approver phone
  const { data: l1 } = await supabase
    .from('employees')
    .select('first_name, last_name, phone')
    .eq('id', chain.l1ApproverId)
    .single();

  // Send WhatsApp to L1 approver
  if (l1?.phone) {
    await notifyLeaveApprover({
      approverPhone: l1.phone.replace(/[^0-9]/g, ''),
      employeeName: \`\${emp.first_name} \${emp.last_name}\`,
      leaveType: finalLeaveType,
      dateFrom,
      dateTo,
      days: sandwich.totalCalendarDays,
      reason,
      plBalance: plBalance - plToConsume,
      approveUrl,
    });
  }

  return NextResponse.json({
    success: true,
    leaveId: leave.id,
    leaveType: finalLeaveType,
    plToConsume,
    plBalance,
    noticeViolation,
    retroactive,
    sandwich: {
      totalDays: sandwich.totalCalendarDays,
      sandwichedHolidays: sandwich.sandwichedHolidays,
      breakdown: sandwich.breakdown,
    },
  });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: LEAVE — Get + Approve/Reject
// ═══════════════════════════════════════════════════════════════
write('app/api/leave/[id]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyEmployeeDecision, notifyLeaveApprover, notifyKushAAA } from '@/lib/whatsapp';
import { generateToken } from '@/lib/approval-tokens';

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = adminSupabase();
  const { data, error } = await supabase
    .from('leave_requests')
    .select(\`
      *,
      employee:employee_id(first_name, last_name, employee_no, department, location, phone),
      l1_approver:l1_approver_id(first_name, last_name),
      l2_approver:l2_approver_id(first_name, last_name),
      l3_approver:l3_approver_id(first_name, last_name)
    \`)
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { action, approverId, comment } = await request.json();
  // action: 'approve' | 'reject'

  const supabase = adminSupabase();

  const { data: leave } = await supabase
    .from('leave_requests')
    .select(\`
      *, 
      employee:employee_id(first_name, last_name, phone, employment_type),
      l1_approver:l1_approver_id(first_name, last_name, phone),
      l2_approver:l2_approver_id(first_name, last_name, phone),
      l3_approver:l3_approver_id(first_name, last_name, phone)
    \`)
    .eq('id', params.id)
    .single();

  if (!leave) return NextResponse.json({ error: 'Leave not found' }, { status: 404 });

  const now = new Date().toISOString();

  if (action === 'reject') {
    await supabase.from('leave_requests').update({
      status: 'Rejected',
      rejected_by: approverId,
      rejected_at: now,
      rejection_reason: comment,
    }).eq('id', params.id);

    // ── EDGE CASE 6: Leave rejected + employee absent ─────────
    // Check if employee is already absent on those dates
    const { data: absences } = await supabase
      .from('attendance_daily')
      .select('date, status')
      .eq('employee_id', leave.employee_id)
      .gte('date', leave.date_from)
      .lte('date', leave.date_to)
      .in('status', ['AAA', 'AAA_PENDING', 'A']);

    if (absences && absences.length > 0) {
      // Auto-flag as AAA and alert Kush
      await supabase.from('attendance_daily')
        .update({ status: 'AAA' })
        .eq('employee_id', leave.employee_id)
        .in('date', absences.map(a => a.date));

      // Alert Kush
      const { data: kush } = await supabase
        .from('employees')
        .select('phone')
        .eq('employee_no', 'CF-004')
        .single();

      if (kush?.phone) {
        await notifyKushAAA({
          kushPhone: kush.phone.replace(/[^0-9]/g, ''),
          employeeName: \`\${leave.employee?.first_name} \${leave.employee?.last_name}\`,
          date: \`\${leave.date_from} to \${leave.date_to}\`,
        });
      }
    }

    // Notify employee
    if (leave.employee?.phone) {
      await notifyEmployeeDecision({
        employeePhone: leave.employee.phone.replace(/[^0-9]/g, ''),
        leaveType: leave.leave_type,
        dateFrom: leave.date_from,
        dateTo: leave.date_to,
        decision: 'Rejected',
        comment,
      });
    }

    return NextResponse.json({ success: true, status: 'Rejected' });
  }

  if (action === 'approve') {
    const status = leave.status;
    const chainType = leave.chain_type;

    let nextStatus: string;
    let nextApproverId: string | null = null;
    let nextApproverPhone: string | null = null;
    let finallyApproved = false;

    if (status === 'Pending') {
      // L1 approving
      await supabase.from('leave_requests').update({
        status: 'L1_Approved',
        l1_approved_at: now,
        l1_comment: comment,
      }).eq('id', params.id);
      nextStatus = 'L1_Approved';

      if (chainType === '2step') {
        // Next is L2 (Kush = final)
        nextApproverId = leave.l2_approver_id;
        nextApproverPhone = leave.l2_approver?.phone ?? null;
      } else {
        // 3-step: next is L2 (Shailoo)
        nextApproverId = leave.l2_approver_id;
        nextApproverPhone = leave.l2_approver?.phone ?? null;
      }

    } else if (status === 'L1_Approved') {
      await supabase.from('leave_requests').update({
        status: 'L2_Approved',
        l2_approved_at: now,
        l2_comment: comment,
      }).eq('id', params.id);
      nextStatus = 'L2_Approved';

      if (chainType === '2step') {
        // 2-step: L2 = Kush = final approval
        finallyApproved = true;
      } else {
        // 3-step: next is L3 (Kush)
        nextApproverId = leave.l3_approver_id;
        nextApproverPhone = leave.l3_approver?.phone ?? null;
      }

    } else if (status === 'L2_Approved') {
      // Only 3-step reaches here — L3 = Kush = final
      await supabase.from('leave_requests').update({
        status: 'Approved',
        l3_approved_at: now,
        l3_comment: comment,
      }).eq('id', params.id);
      finallyApproved = true;
    }

    if (finallyApproved) {
      // Final approval: update status to Approved
      await supabase.from('leave_requests').update({ status: 'Approved' }).eq('id', params.id);

      // Deduct PL balance
      if (['PL','HPL'].includes(leave.leave_type) && leave.pl_to_deduct > 0) {
        const fyNow = new Date().getMonth() >= 3
          ? \`\${new Date().getFullYear()}-\${String(new Date().getFullYear() + 1).slice(2)}\`
          : \`\${new Date().getFullYear() - 1}-\${String(new Date().getFullYear()).slice(2)}\`;

        await supabase.rpc('increment_pl_used', {
          p_employee_id: leave.employee_id,
          p_financial_year: fyNow,
          p_amount: leave.pl_to_deduct,
        }).catch(() => {
          // Fallback: manual update
          supabase.from('leave_balances')
            .update({ pl_used: supabase.raw('pl_used + ' + leave.pl_to_deduct) })
            .eq('employee_id', leave.employee_id)
            .eq('financial_year', fyNow);
        });
      }

      // Update attendance_daily records for leave period (retroactive fix)
      const from = new Date(leave.date_from);
      const to   = new Date(leave.date_to);
      const cur  = new Date(from);
      while (cur <= to) {
        const dateStr = cur.toISOString().split('T')[0];
        await supabase.from('attendance_daily').upsert({
          employee_id: leave.employee_id,
          date: dateStr,
          status: leave.leave_type,
          leave_id: leave.id,
          check_in: null, check_out: null, hours_worked: null,
          red_marks_morning: 0, red_marks_evening: 0, red_marks_total: 0,
        }, { onConflict: 'employee_id,date' });
        cur.setDate(cur.getDate() + 1);
      }

      // ── EDGE CASE 9: March 31 check (handled by year-end cron) ──

      // Notify employee
      if (leave.employee?.phone) {
        await notifyEmployeeDecision({
          employeePhone: leave.employee.phone.replace(/[^0-9]/g, ''),
          leaveType: leave.leave_type,
          dateFrom: leave.date_from,
          dateTo: leave.date_to,
          decision: 'Approved',
        });
      }

      return NextResponse.json({ success: true, status: 'Approved' });
    }

    // Not finally approved — send to next approver
    if (nextApproverPhone) {
      const newToken = generateToken();
      await supabase.from('leave_requests').update({ approval_token: newToken }).eq('id', params.id);
      const approveUrl = \`\${process.env.NEXT_PUBLIC_APP_URL}/approve/\${newToken}\`;

      await notifyLeaveApprover({
        approverPhone: nextApproverPhone.replace(/[^0-9]/g, ''),
        employeeName: \`\${leave.employee?.first_name} \${leave.employee?.last_name}\`,
        leaveType: leave.leave_type,
        dateFrom: leave.date_from,
        dateTo: leave.date_to,
        days: leave.working_days_count ?? 1,
        reason: leave.reason,
        plBalance: 0,
        approveUrl,
      });
    }

    return NextResponse.json({ success: true, status: 'Forwarded to next approver' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: APPROVE — One-tap WhatsApp link (no auth required)
// ═══════════════════════════════════════════════════════════════
write('app/api/approve/[token]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { getLeaveByToken } from '@/lib/approval-tokens';

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const leave = await getLeaveByToken(params.token);
  if (!leave) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  return NextResponse.json(leave);
}
`);

// ═══════════════════════════════════════════════════════════════
// API: ATTENDANCE — Manual correction (Edge Case 10)
// ═══════════════════════════════════════════════════════════════
write('app/api/attendance/correct/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const {
    attendanceId, employeeId, date,
    newStatus, correctionType, reason, correctedBy
  } = await request.json();

  if (!reason || reason.trim().length < 5) {
    return NextResponse.json({ error: 'Reason is mandatory and must be at least 5 characters.' }, { status: 400 });
  }

  const validTypes = ['biometric_failure', 'approved_leave_not_captured', 'other'];
  if (!validTypes.includes(correctionType)) {
    return NextResponse.json({ error: 'Invalid correction type.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get original record
  const { data: original } = await supabase
    .from('attendance_daily')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .single();

  if (!original) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });

  // Update record
  const { error: updateErr } = await supabase
    .from('attendance_daily')
    .update({
      status: newStatus,
      is_manually_corrected: true,
      correction_reason: reason,
      corrected_by: correctedBy,
      corrected_at: new Date().toISOString(),
      original_status: original.status,
    })
    .eq('employee_id', employeeId)
    .eq('date', date);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Write immutable audit log
  await supabase.from('audit_log').insert({
    table_name: 'attendance_daily',
    record_id: original.id,
    action: 'OVERRIDE',
    old_values: { status: original.status, check_in: original.check_in, check_out: original.check_out },
    new_values: { status: newStatus },
    changed_by: correctedBy,
    reason: \`[\${correctionType}] \${reason}\`,
  });

  return NextResponse.json({ success: true });
}
`);


// ═══════════════════════════════════════════════════════════════
// API: TIME OFF PERMISSION
// ═══════════════════════════════════════════════════════════════
write('app/api/time-off/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsApp } from '@/lib/whatsapp';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const supabase = db();

  const { data } = await supabase
    .from('time_off_permissions')
    .select('*, employee:employee_id(first_name, last_name, employee_no, photo_url)')
    .eq('date', date)
    .order('created_at', { ascending: false });

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { employeeId, date, timeOut, timeInExpected, purpose } = await request.json();
  const supabase = db();

  const { data: perm, error } = await supabase
    .from('time_off_permissions')
    .insert({ employee_id: employeeId, date, time_out: timeOut, time_in_expected: timeInExpected, purpose, status: 'Pending' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify direct supervisor
  const { data: emp } = await supabase
    .from('employees')
    .select('first_name, last_name, employee_no, reporting_manager_id')
    .eq('id', employeeId)
    .single();

  if (emp?.reporting_manager_id) {
    const { data: supervisor } = await supabase
      .from('employees')
      .select('phone, first_name')
      .eq('id', emp.reporting_manager_id)
      .single();

    if (supervisor?.phone) {
      await sendWhatsApp(
        supervisor.phone.replace(/[^0-9]/g, ''),
        'comfy_time_off_approved',
        [
          \`\${emp.first_name} \${emp.last_name}\`,
          timeOut,
          date,
          purpose,
          timeInExpected ?? 'Before shift end',
        ]
      );
    }
  }

  return NextResponse.json({ success: true, id: perm.id });
}
`);

write('app/api/time-off/[id]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { action, approverId } = await request.json();
  const supabase = db();

  const status = action === 'approve' ? 'Approved' : 'Rejected';
  await supabase.from('time_off_permissions').update({
    status,
    approved_by: approverId,
    approved_at: new Date().toISOString(),
  }).eq('id', params.id);

  return NextResponse.json({ success: true, status });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: ON DUTY
// ═══════════════════════════════════════════════════════════════
write('app/api/on-duty/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsApp } from '@/lib/whatsapp';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const supabase = db();

  let q = supabase.from('on_duty_requests')
    .select('*, employee:employee_id(first_name, last_name, employee_no)')
    .order('created_at', { ascending: false });

  if (date) q = q.eq('date', date);
  const { data } = await q;
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = db();

  const { data: od, error } = await supabase
    .from('on_duty_requests')
    .insert({
      employee_id: body.employeeId,
      date: body.date,
      time_out: body.timeOut,
      time_in_planned: body.timeInPlanned,
      purpose: body.purpose,
      location_to_visit: body.locationToVisit,
      vehicle_type: body.vehicleType,
      vehicle_number: body.vehicleNumber,
      outward_km: body.outwardKm,
      project_site: body.projectSite,
      status: 'Pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify Kush for approval
  const { data: kush } = await supabase.from('employees').select('phone').eq('employee_no', 'CF-004').single();
  const { data: emp } = await supabase.from('employees').select('first_name, last_name').eq('id', body.employeeId).single();

  if (kush?.phone && emp) {
    await sendWhatsApp(
      kush.phone.replace(/[^0-9]/g, ''),
      'comfy_on_duty_approved',
      [
        \`\${emp.first_name} \${emp.last_name}\`,
        'Official Duty',
        body.date,
        body.timeOut,
        body.locationToVisit,
        \`\${body.vehicleType ?? 'N/A'}: \${body.vehicleNumber ?? 'N/A'}\`,
        'Kush Patel',
      ]
    );
  }

  return NextResponse.json({ success: true, id: od.id });
}
`);

write('app/api/on-duty/[id]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = db();
  const { data } = await supabase.from('on_duty_requests').select('*, employee:employee_id(first_name,last_name,employee_no)').eq('id', params.id).single();
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const supabase = db();

  const updates: any = {};
  if (body.action === 'approve') {
    updates.status = 'Approved';
    updates.approved_by = body.approverId;
    updates.approved_at = new Date().toISOString();
    updates.security_out_confirmed = body.securityOut ?? false;
  }
  if (body.inwardKm !== undefined) {
    updates.inward_km = body.inwardKm;
    updates.time_in_actual = body.timeInActual;
    updates.security_in_confirmed = true;
    updates.status = 'Returned';
  }

  await supabase.from('on_duty_requests').update(updates).eq('id', params.id);
  return NextResponse.json({ success: true });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: ATTENDANCE — Monthly/Weekly data
// ═══════════════════════════════════════════════════════════════
write('app/api/attendance/monthly/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId');
  const month = searchParams.get('month')!; // 'YYYY-MM'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const from = month + '-01';
  const to   = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0).toISOString().split('T')[0];

  let q = supabase.from('attendance_daily')
    .select('*, employee:employee_id(first_name,last_name,employee_no)')
    .gte('date', from)
    .lte('date', to)
    .order('date');

  if (employeeId) q = q.eq('employee_id', employeeId);

  const { data } = await q;
  return NextResponse.json(data ?? []);
}
`);

write('app/api/attendance/weekly/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get('weekStart')!; // 'YYYY-MM-DD' (Monday)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const from = weekStart;
  const toDate = new Date(weekStart);
  toDate.setDate(toDate.getDate() + 6);
  const to = toDate.toISOString().split('T')[0];

  const { data } = await supabase
    .from('attendance_daily')
    .select('*, employee:employee_id(first_name,last_name,employee_no,department,shift_id)')
    .gte('date', from)
    .lte('date', to)
    .order('date');

  return NextResponse.json(data ?? []);
}
`);

// ═══════════════════════════════════════════════════════════════
// API: PAYROLL REPORT — Excel export
// ═══════════════════════════════════════════════════════════════
write('app/api/payroll/report/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { redMarkDeductionDays } from '@/lib/red-marks';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month')!; // 'YYYY-MM'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const from = month + '-01';
  const to   = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0).toISOString().split('T')[0];

  // Load all active employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employee_no, first_name, last_name, department, shift_id, daily_salary_rate, employment_type')
    .eq('status', 'Active')
    .order('employee_no');

  // Load attendance for this month
  const { data: attendance } = await supabase
    .from('attendance_daily')
    .select('employee_id, date, status, red_marks_total')
    .gte('date', from)
    .lte('date', to);

  // Group attendance by employee
  const attMap = new Map<string, typeof attendance>();
  (attendance ?? []).forEach(a => {
    if (!attMap.has(a.employee_id)) attMap.set(a.employee_id, []);
    attMap.get(a.employee_id)!.push(a);
  });

  // Load active loans
  const { data: loans } = await supabase
    .from('employee_loans')
    .select('employee_id, repayment_per_month, outstanding_balance')
    .eq('status', 'Approved')
    .gt('outstanding_balance', 0);

  const loanMap = new Map((loans ?? []).map(l => [l.employee_id, l]));

  const rows: any[] = [];

  for (const emp of (employees ?? [])) {
    const empAtt = attMap.get(emp.id) ?? [];
    const dailyRate = emp.daily_salary_rate ?? 0;

    const daysPresent = empAtt.filter(a => ['P','LC','EG'].includes(a.status)).length;
    const plUsed      = empAtt.filter(a => a.status === 'PL').length
                      + empAtt.filter(a => a.status === 'HPL').length * 0.5;
    const ulDays      = empAtt.filter(a => a.status === 'UL').length
                      + empAtt.filter(a => a.status === 'HUL').length * 0.5;
    const holidays    = empAtt.filter(a => a.status === 'H').length;
    const absents     = empAtt.filter(a => a.status === 'A').length;
    const aaaCount    = empAtt.filter(a => a.status === 'AAA').length;
    const aaCount     = empAtt.filter(a => a.status === 'AA').length;

    const totalRedMarks = empAtt.reduce((sum, a) => sum + (a.red_marks_total ?? 0), 0);
    const redMarkDedDays = redMarkDeductionDays(totalRedMarks);
    const redMarkDedRs   = redMarkDedDays * dailyRate;
    const aaaDedRs       = aaaCount * 3 * dailyRate;
    const aaDedRs        = aaCount  * 2 * dailyRate;
    const absentDedRs    = absents  * 1 * dailyRate;
    const ulDedRs        = ulDays   * dailyRate;

    const loan = loanMap.get(emp.id);
    const loanDedRs = loan ? Math.min(loan.repayment_per_month, loan.outstanding_balance) : 0;

    const totalDeductionRs = redMarkDedRs + aaaDedRs + aaDedRs + absentDedRs + ulDedRs + loanDedRs;
    const netWorkingDays   = daysPresent + plUsed + holidays;

    rows.push({
      'Emp No':             emp.employee_no,
      'Name':               \`\${emp.first_name} \${emp.last_name}\`,
      'Department':         emp.department ?? '',
      'Type':               emp.employment_type,
      'Daily Rate (₹)':     dailyRate,
      'Present':            daysPresent,
      'PL Used':            plUsed,
      'UL Days':            ulDays,
      'Holidays':           holidays,
      'Absents (A)':        absents,
      'AAA Count':          aaaCount,
      'AA Count':           aaCount,
      'Red Marks':          totalRedMarks,
      'Red Mark Ded (Days)':redMarkDedDays,
      'Red Mark Ded (₹)':   redMarkDedRs.toFixed(2),
      'AAA Ded (₹)':        aaaDedRs.toFixed(2),
      'AA Ded (₹)':         aaDedRs.toFixed(2),
      'Absent Ded (₹)':     absentDedRs.toFixed(2),
      'UL Ded (₹)':         ulDedRs.toFixed(2),
      'Loan Ded (₹)':       loanDedRs.toFixed(2),
      'Total Deduction (₹)':totalDeductionRs.toFixed(2),
      'Net Working Days':   netWorkingDays,
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, \`Payroll \${month}\`);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': \`attachment; filename="payroll-\${month}.xlsx"\`,
    },
  });
}
`);

// ═══════════════════════════════════════════════════════════════
// API: LEAVE — List pending + employee's own
// ═══════════════════════════════════════════════════════════════
write('app/api/leave/pending/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const approverId  = searchParams.get('approverId');
  const employeeId  = searchParams.get('employeeId');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let q = supabase
    .from('leave_requests')
    .select(\`
      *, 
      employee:employee_id(first_name, last_name, employee_no, department),
      l1_approver:l1_approver_id(first_name, last_name),
      l2_approver:l2_approver_id(first_name, last_name),
      l3_approver:l3_approver_id(first_name, last_name)
    \`)
    .order('created_at', { ascending: false });

  if (employeeId) q = q.eq('employee_id', employeeId);

  if (approverId) {
    q = q.or(
      \`and(l1_approver_id.eq.\${approverId},status.eq.Pending),\` +
      \`and(l2_approver_id.eq.\${approverId},status.eq.L1_Approved),\` +
      \`and(l3_approver_id.eq.\${approverId},status.eq.L2_Approved)\`
    );
  }

  const { data } = await q;
  return NextResponse.json(data ?? []);
}
`);


// ═══════════════════════════════════════════════════════════════
// PAGE: LEAVE — Application form (sandwich rule, all edge cases)
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/leave/apply/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string, string> = {
  PL: 'bg-green-100 text-green-800', HPL: 'bg-green-50 text-green-700',
  UL: 'bg-orange-100 text-orange-800', HUL: 'bg-orange-50 text-orange-700',
  LC: 'bg-yellow-100 text-yellow-800', EG: 'bg-yellow-100 text-yellow-800',
};

export default function ApplyLeavePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [form, setForm] = useState({
    leaveType: 'PL', halfDayType: '', dateFrom: '', dateTo: '',
    reason: '', outOfStation: false, outOfStationContact: '', outOfStationAddress: '',
  });
  const [sandwich, setSandwich] = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [converting, setConverting] = useState(false); // Edge case 1

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        supabase.from('user_accounts').select('employee_id').eq('id', data.user.id).single()
          .then(({ data: ua }) => {
            if (ua) {
              supabase.from('employees').select('*').eq('id', ua.employee_id).single()
                .then(({ data: emp }) => setEmployee(emp));
              fetch(\`/api/leave/balance?employeeId=\${ua.employee_id}\`)
                .then(r => r.json()).then(setBalance);
            }
          });
      }
    });
  }, []);

  useEffect(() => {
    if (form.dateFrom && form.dateTo && employee && form.dateFrom <= form.dateTo) {
      fetch(\`/api/leave/sandwich?from=\${form.dateFrom}&to=\${form.dateTo}&employeeId=\${employee.id}\`)
        .then(r => r.json()).then(setSandwich);
    }
  }, [form.dateFrom, form.dateTo, employee]);

  const isHalfDay = ['HPL','HUL'].includes(form.leaveType);
  const isFullDay = ['PL','UL'].includes(form.leaveType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    setLoading(true); setError('');

    const payload = {
      employeeId: employee.id,
      leaveType: form.leaveType,
      halfDayType: form.halfDayType || null,
      dateFrom: form.dateFrom,
      dateTo: isHalfDay ? form.dateFrom : form.dateTo,
      reason: form.reason,
      outOfStation: form.outOfStation,
      outOfStationContact: form.outOfStationContact,
      outOfStationAddress: form.outOfStationAddress,
      convertFromPL: converting,
    };

    const res  = await fetch('/api/leave/apply', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();

    if (data.error === 'INSUFFICIENT_PL') {
      setError(data.message);
      setConverting(true);
      setLoading(false);
      return;
    }
    if (data.error === 'PROBATIONER_PL_BLOCKED') {
      setError(data.message);
      setLoading(false);
      return;
    }
    if (data.error) {
      setError(data.error);
      setLoading(false);
      return;
    }

    router.push(\`/leave/\${data.leaveId}?applied=true\`);
  }

  if (!employee) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const plBalance = balance?.pl_balance ?? 0;
  const plNeeded  = sandwich?.plToDeduct ?? 0;
  const noticeViolation = form.dateFrom && ['PL','UL'].includes(form.leaveType)
    ? (new Date(form.dateFrom).getTime() - Date.now()) / (1000*60*60*24) < 3
    : false;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Apply for Leave</h1>

      {/* PL Balance */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <div className="text-sm text-gray-600">Available PL Balance</div>
        <div className="text-3xl font-bold text-green-700">{plBalance} days</div>
      </div>

      {/* Edge case 2: Probationer warning */}
      {employee.employment_type === 'Probationer' && form.leaveType === 'PL' && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3 mb-4 text-sm text-amber-800">
          ⚠️ You are on probation. PL cannot be used — only Unpaid Leave (UL) is available.
        </div>
      )}

      {/* Notice violation warning */}
      {noticeViolation && form.dateFrom && (
        <div className="bg-red-50 border border-red-300 rounded p-3 mb-4 text-sm text-red-800">
          ⚠️ NOTICE VIOLATION: Full day leave should be applied at least 3 days in advance. Your request will be submitted with a notice violation flag visible to approvers.
        </div>
      )}

      {/* Edge case 1: Converting PL to UL */}
      {converting && (
        <div className="bg-orange-50 border border-orange-400 rounded p-4 mb-4">
          <p className="text-sm font-medium text-orange-900 mb-2">
            ⚠️ Insufficient PL balance. Convert to Unpaid Leave?
          </p>
          <p className="text-sm text-orange-800">
            This will result in <strong>{plNeeded} day(s) salary deduction</strong>.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setForm(f => ({ ...f, leaveType: 'UL' })); setConverting(false); setError(''); }}
              className="px-4 py-2 bg-orange-600 text-white rounded text-sm">
              Convert to UL
            </button>
            <button onClick={() => { setConverting(false); setError(''); }}
              className="px-4 py-2 border rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      {error && !converting && (
        <div className="bg-red-50 border border-red-300 text-red-800 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Leave type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
          <div className="grid grid-cols-3 gap-2">
            {['PL','HPL','UL','HUL','LC','EG'].map(t => (
              <button type="button" key={t}
                onClick={() => setForm(f => ({ ...f, leaveType: t, dateFrom: '', dateTo: '' }))}
                className={\`p-2 rounded border text-sm font-medium \${form.leaveType === t ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}\`}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {form.leaveType === 'PL' ? 'Paid Leave (full day, deducted from PL balance)' :
             form.leaveType === 'HPL' ? 'Half Paid Leave (0.5 day from PL balance)' :
             form.leaveType === 'UL' ? 'Unpaid Leave (full day salary deduction)' :
             form.leaveType === 'HUL' ? 'Half Unpaid Leave (half day salary deduction)' :
             form.leaveType === 'LC' ? 'Late Coming (red mark system — pre-approve to avoid red marks)' :
             'Early Going (red mark system — pre-approve to avoid red marks)'}
          </p>
        </div>

        {/* Half day selector */}
        {isHalfDay && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Which Half?</label>
            <div className="flex gap-3">
              {['First Half','Second Half'].map(h => (
                <button type="button" key={h}
                  onClick={() => setForm(f => ({ ...f, halfDayType: h }))}
                  className={\`px-4 py-2 rounded border text-sm \${form.halfDayType === h ? 'border-green-500 bg-green-50' : 'border-gray-200'}\`}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date selection */}
        <div className={isHalfDay ? '' : 'grid grid-cols-2 gap-4'}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isHalfDay ? 'Date' : 'From Date'}
            </label>
            <input type="date" value={form.dateFrom}
              onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))}
              className="w-full border rounded-lg p-2.5 text-sm" required />
          </div>
          {!isHalfDay && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={form.dateTo} min={form.dateFrom}
                onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))}
                className="w-full border rounded-lg p-2.5 text-sm" required />
            </div>
          )}
        </div>

        {/* Sandwich rule preview */}
        {sandwich && form.dateFrom && !isHalfDay && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">📅 Sandwich Rule Calculation</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-800">{sandwich.totalCalendarDays}</div>
                <div className="text-blue-600 text-xs">Calendar Days</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-700">{sandwich.sandwichedHolidays.length}</div>
                <div className="text-orange-600 text-xs">Sandwiched</div>
              </div>
              <div className="text-center">
                <div className={\`text-lg font-bold \${['PL','HPL'].includes(form.leaveType) ? 'text-red-700' : 'text-gray-700'}\`}>
                  {['PL','HPL'].includes(form.leaveType) ? sandwich.plToDeduct : 0}
                </div>
                <div className="text-xs text-gray-600">PL to Deduct</div>
              </div>
            </div>
            {sandwich.sandwichedHolidays.length > 0 && (
              <p className="text-xs text-orange-800 mt-2">
                ⚠️ Includes: {sandwich.sandwichedHolidays.join(', ')} — these days count as leave under sandwich rule.
              </p>
            )}
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <textarea value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            className="w-full border rounded-lg p-2.5 text-sm" rows={3} required
            placeholder="Please provide a reason for your leave..." />
        </div>

        {/* Out of station */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.outOfStation}
              onChange={e => setForm(f => ({ ...f, outOfStation: e.target.checked }))}
              className="rounded" />
            Travelling out of station during leave?
          </label>
          {form.outOfStation && (
            <div className="mt-3 space-y-2">
              <input type="tel" placeholder="Contact number while away"
                value={form.outOfStationContact}
                onChange={e => setForm(f => ({ ...f, outOfStationContact: e.target.value }))}
                className="w-full border rounded-lg p-2.5 text-sm" />
              <input type="text" placeholder="Address while away"
                value={form.outOfStationAddress}
                onChange={e => setForm(f => ({ ...f, outOfStationAddress: e.target.value }))}
                className="w-full border rounded-lg p-2.5 text-sm" />
            </div>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
          {loading ? 'Submitting...' : 'Submit Leave Application'}
        </button>
      </form>
    </div>
  );
}
`);


// ═══════════════════════════════════════════════════════════════
// PAGE: LEAVE — List (for admin/supervisor with pending approvals)
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/leave/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  L1_Approved: 'bg-blue-100 text-blue-800',
  L2_Approved: 'bg-indigo-100 text-indigo-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  Cancelled: 'bg-gray-100 text-gray-600',
};

export default function LeavePage() {
  const [leaves, setLeaves]     = useState<any[]>([]);
  const [userId, setUserId]     = useState('');
  const [empId, setEmpId]       = useState('');
  const [role, setRole]         = useState('');
  const [filter, setFilter]     = useState('pending');
  const [loading, setLoading]   = useState(true);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      supabase.from('user_accounts').select('employee_id, role').eq('id', data.user.id).single()
        .then(({ data: ua }) => {
          if (ua) { setEmpId(ua.employee_id); setRole(ua.role); }
        });
    });
  }, []);

  useEffect(() => {
    if (!empId) return;
    const isAdmin = ['super_admin','production_head','design_head','project_head','accounts'].includes(role);
    const url = filter === 'mine'
      ? \`/api/leave/pending?employeeId=\${empId}\`
      : isAdmin
        ? \`/api/leave/pending?approverId=\${empId}\`
        : \`/api/leave/pending?employeeId=\${empId}\`;

    setLoading(true);
    fetch(url).then(r => r.json()).then(d => { setLeaves(d); setLoading(false); });
  }, [empId, filter, role]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Leave Management</h1>
        <Link href="/leave/apply"
          className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + Apply Leave
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {['pending','mine'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={\`px-4 py-2 rounded-md text-sm font-medium \${filter === f ? 'bg-white shadow text-gray-900' : 'text-gray-500'}\`}>
            {f === 'pending' ? 'Pending My Approval' : 'My Leaves'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No leave requests found.</div>
      ) : (
        <div className="space-y-3">
          {leaves.map(l => (
            <Link key={l.id} href={\`/leave/\${l.id}\`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-400 transition cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {l.employee?.first_name} {l.employee?.last_name}
                      </span>
                      <span className="text-xs text-gray-500">{l.employee?.employee_no}</span>
                      {l.notice_violation && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded font-medium">NOTICE VIOLATION</span>
                      )}
                      {l.is_retroactive && (
                        <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded font-medium">RETROACTIVE</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">{l.leave_type}</span> ·{' '}
                      {l.date_from} {l.date_from !== l.date_to ? \`→ \${l.date_to}\` : ''} ·{' '}
                      {l.working_days_count ?? '?'} working day(s)
                    </div>
                    <div className="text-sm text-gray-500 mt-1 truncate max-w-lg">{l.reason}</div>
                  </div>
                  <span className={\`px-3 py-1 rounded-full text-xs font-medium \${STATUS_BADGE[l.status] ?? 'bg-gray-100 text-gray-700'}\`}>
                    {l.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// PAGE: LEAVE — Detail + Approve/Reject
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/leave/[id]/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useParams, useRouter } from 'next/navigation';

export default function LeaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [leave, setLeave]     = useState<any>(null);
  const [empId, setEmpId]     = useState('');
  const [role, setRole]       = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  useEffect(() => {
    fetch(\`/api/leave/\${id}\`).then(r => r.json()).then(setLeave);
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('user_accounts').select('employee_id,role').eq('id', data.user.id).single()
        .then(({ data: ua }) => { if (ua) { setEmpId(ua.employee_id); setRole(ua.role); } });
    });
  }, [id]);

  async function act(action: 'approve' | 'reject') {
    setLoading(true);
    const res = await fetch(\`/api/leave/\${id}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, approverId: empId, comment }),
    });
    const data = await res.json();
    if (data.success) router.push('/leave');
    else { alert(data.error); setLoading(false); }
  }

  if (!leave) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const isMyTurn = (
    (leave.status === 'Pending'      && leave.l1_approver_id === empId) ||
    (leave.status === 'L1_Approved'  && leave.l2_approver_id === empId) ||
    (leave.status === 'L2_Approved'  && leave.l3_approver_id === empId)
  );

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold mb-6">Leave Application</h1>

      {/* Flags */}
      <div className="flex gap-2 mb-4">
        {leave.notice_violation && (
          <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">⚠️ NOTICE VIOLATION</span>
        )}
        {leave.is_retroactive && (
          <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">📅 RETROACTIVE APPLICATION</span>
        )}
      </div>

      <div className="bg-white border rounded-xl divide-y">
        <div className="p-4 grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Employee</span><div className="font-medium">{leave.employee?.first_name} {leave.employee?.last_name} ({leave.employee?.employee_no})</div></div>
          <div><span className="text-gray-500">Department</span><div>{leave.employee?.department}</div></div>
          <div><span className="text-gray-500">Leave Type</span><div className="font-medium">{leave.leave_type} {leave.half_day_type ? \`(\${leave.half_day_type})\` : ''}</div></div>
          <div><span className="text-gray-500">Status</span><div className="font-medium">{leave.status}</div></div>
          <div><span className="text-gray-500">From</span><div>{leave.date_from}</div></div>
          <div><span className="text-gray-500">To</span><div>{leave.date_to}</div></div>
          <div><span className="text-gray-500">Working Days</span><div>{leave.working_days_count}</div></div>
          <div><span className="text-gray-500">PL to Deduct</span><div>{leave.pl_to_deduct}</div></div>
          <div className="col-span-2"><span className="text-gray-500">Reason</span><div>{leave.reason}</div></div>
          {leave.out_of_station && (
            <>
              <div><span className="text-gray-500">Out of Station Contact</span><div>{leave.out_of_station_contact}</div></div>
              <div><span className="text-gray-500">Address</span><div>{leave.out_of_station_address}</div></div>
            </>
          )}
        </div>

        {/* Approval chain status */}
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Approval Chain ({leave.chain_type})</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: 'L1', approver: leave.l1_approver, at: leave.l1_approved_at, comment: leave.l1_comment },
              { label: 'L2', approver: leave.l2_approver, at: leave.l2_approved_at, comment: leave.l2_comment },
              ...(leave.chain_type === '3step' ? [{ label: 'L3 (Kush)', approver: leave.l3_approver, at: leave.l3_approved_at, comment: leave.l3_comment }] : []),
            ].map(step => (
              <div key={step.label} className="flex items-center gap-3">
                <span className={\`w-2 h-2 rounded-full \${step.at ? 'bg-green-500' : 'bg-gray-300'}\`}></span>
                <span className="text-gray-600">{step.label}: {step.approver?.first_name} {step.approver?.last_name}</span>
                {step.at && <span className="text-green-600 text-xs">✓ {new Date(step.at).toLocaleDateString('en-IN')}</span>}
                {step.comment && <span className="text-gray-500 text-xs italic">"{step.comment}"</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons — only shown if it's this user's turn */}
        {isMyTurn && leave.status !== 'Approved' && leave.status !== 'Rejected' && (
          <div className="p-4">
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Optional comment..."
              className="w-full border rounded-lg p-2.5 text-sm mb-3" rows={2} />
            <div className="flex gap-3">
              <button onClick={() => act('approve')} disabled={loading}
                className="flex-1 py-2.5 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
                ✓ Approve
              </button>
              <button onClick={() => act('reject')} disabled={loading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium disabled:opacity-60">
                ✗ Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// PAGE: APPROVE — One-tap WhatsApp link (no login required)
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/approve/[token]/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ApprovePage() {
  const { token }  = useParams<{ token: string }>();
  const [leave, setLeave]   = useState<any>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [done, setDone]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch(\`/api/approve/\${token}\`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setLeave(d); });
  }, [token]);

  async function submit() {
    if (!action) return;
    setLoading(true);
    const res = await fetch(\`/api/leave/\${leave.id}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        approverId: action === 'approve' ? leave.l1_approver_id : leave.l1_approver_id,
        comment,
      }),
    });
    const data = await res.json();
    if (data.success) setDone(true);
    else { setError(data.error); setLoading(false); }
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-gray-700 font-medium">Invalid or expired link</div>
        <p className="text-gray-500 text-sm mt-2">This approval link has expired or already been used.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">{action === 'approve' ? '✅' : '❌'}</div>
        <div className="text-xl font-semibold text-gray-900 mb-2">
          Leave {action === 'approve' ? 'Approved' : 'Rejected'}
        </div>
        <p className="text-gray-500 text-sm">The employee has been notified via WhatsApp.</p>
      </div>
    </div>
  );

  if (!leave) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        <div className="bg-green-700 text-white p-5">
          <div className="text-xs font-medium opacity-80 mb-1">COMFY WORKS — LEAVE APPROVAL</div>
          <div className="text-xl font-semibold">
            {leave.employee?.first_name} {leave.employee?.last_name}
          </div>
          <div className="text-sm opacity-80">{leave.employee?.employee_no} · {leave.employee?.department}</div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">Leave Type</div>
              <div className="font-semibold">{leave.leave_type}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">Days</div>
              <div className="font-semibold">{leave.working_days_count}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">From</div>
              <div className="font-semibold">{leave.date_from}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">To</div>
              <div className="font-semibold">{leave.date_to}</div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="text-gray-500 text-xs mb-1">Reason</div>
            <div>{leave.reason}</div>
          </div>

          {leave.notice_violation && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              ⚠️ NOTICE VIOLATION — Applied less than 3 days in advance
            </div>
          )}
          {leave.is_retroactive && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
              📅 RETROACTIVE — Applied after leave date
            </div>
          )}

          <textarea value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Optional comment..."
            className="w-full border rounded-lg p-3 text-sm" rows={2} />

          <div className="flex gap-3">
            <button onClick={() => { setAction('approve'); setTimeout(submit, 0); }} disabled={loading}
              className="flex-1 py-3 bg-green-700 text-white rounded-xl font-semibold text-base disabled:opacity-60">
              ✓ Approve
            </button>
            <button onClick={() => { setAction('reject'); setTimeout(submit, 0); }} disabled={loading}
              className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-base disabled:opacity-60">
              ✗ Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
`);


// ═══════════════════════════════════════════════════════════════
// PAGE: ATTENDANCE — Monthly calendar view
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/attendance/monthly/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-100 text-green-800', PL:'bg-teal-100 text-teal-800',
  HPL:'bg-teal-50 text-teal-700', UL:'bg-orange-100 text-orange-800',
  HUL:'bg-orange-50 text-orange-700', H:'bg-blue-100 text-blue-700',
  A:'bg-red-100 text-red-700', AAA:'bg-red-200 text-red-900 font-bold',
  AA:'bg-red-100 text-red-800', HA:'bg-yellow-100 text-yellow-800',
  LC:'bg-yellow-50 text-yellow-700', EG:'bg-yellow-50 text-yellow-700',
  AAA_PENDING:'bg-gray-100 text-gray-600',
};

export default function MonthlyAttendancePage() {
  const now = new Date();
  const [month, setMonth]       = useState(\`\${now.getFullYear()}-\${String(now.getMonth()+1).padStart(2,'0')}\`);
  const [records, setRecords]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    fetch(\`/api/attendance/monthly?month=\${month}\`)
      .then(r => r.json())
      .then(d => { setRecords(d); setLoading(false); });
  }, [month]);

  // Group by employee
  const byEmployee = new Map<string, any>();
  records.forEach(r => {
    const key = r.employee_id;
    if (!byEmployee.has(key)) byEmployee.set(key, { employee: r.employee, days: {} });
    byEmployee.get(key).days[r.date] = r;
  });

  // Get days in month
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, mon-1, i+1);
    return { date: \`\${month}-\${String(i+1).padStart(2,'0')}\`, dayNum: i+1, dayName: d.toLocaleDateString('en-IN',{weekday:'short'}) };
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Monthly Attendance</h1>
        <div className="flex items-center gap-3">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" />
          <a href={\`/api/payroll/report?month=\${month}\`}
            className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
            Export Payroll (.xlsx)
          </a>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 bg-gray-50 border px-3 py-2 text-left text-sm font-medium min-w-[180px]">Employee</th>
                {dates.map(d => (
                  <th key={d.date} className={\`border px-1 py-2 text-center min-w-[36px] \${d.dayName === 'Sun' ? 'bg-blue-50' : ''}\`}>
                    <div>{d.dayNum}</div>
                    <div className="text-gray-400">{d.dayName}</div>
                  </th>
                ))}
                <th className="border px-2 py-2 text-center min-w-[60px]">P</th>
                <th className="border px-2 py-2 text-center min-w-[60px]">Abs</th>
                <th className="border px-2 py-2 text-center min-w-[60px]">PL</th>
                <th className="border px-2 py-2 text-center min-w-[60px]">RedMk</th>
              </tr>
            </thead>
            <tbody>
              {[...byEmployee.entries()].map(([empId, { employee, days }]) => {
                const totalP   = Object.values(days).filter((d: any) => ['P','LC','EG'].includes(d.status)).length;
                const totalAbs = Object.values(days).filter((d: any) => ['A','AAA','AA'].includes(d.status)).length;
                const totalPL  = Object.values(days).filter((d: any) => d.status === 'PL').length;
                const totalRM  = Object.values(days).reduce((s: number, d: any) => s + (d.red_marks_total ?? 0), 0);

                return (
                  <tr key={empId} className="hover:bg-gray-50">
                    <td className="sticky left-0 bg-white border px-3 py-2 font-medium">
                      <Link href={\`/attendance/\${empId}\`} className="hover:text-green-700">
                        {employee?.first_name} {employee?.last_name}
                        <div className="text-gray-400 text-xs font-normal">{employee?.employee_no}</div>
                      </Link>
                    </td>
                    {dates.map(d => {
                      const rec = days[d.date];
                      return (
                        <td key={d.date} className="border p-0 text-center" title={rec?.status ?? ''}>
                          {rec ? (
                            <span className={\`block text-center py-1 \${STATUS_COLORS[rec.status] ?? 'text-gray-300'}\`}>
                              {rec.status === 'AAA_PENDING' ? '?' : rec.status}
                            </span>
                          ) : (
                            <span className="block py-1 text-gray-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border px-2 text-center font-medium text-green-800">{totalP}</td>
                    <td className="border px-2 text-center font-medium text-red-700">{totalAbs}</td>
                    <td className="border px-2 text-center">{totalPL}</td>
                    <td className="border px-2 text-center text-orange-700">{totalRM}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-4">
        {Object.entries(STATUS_COLORS).map(([code, cls]) => (
          <span key={code} className={\`px-2 py-0.5 rounded text-xs \${cls}\`}>{code}</span>
        ))}
      </div>
    </div>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// PAGE: ATTENDANCE — Weekly grid view
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/attendance/weekly/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-500',PL:'bg-teal-400',HPL:'bg-teal-300',
  UL:'bg-orange-400',HUL:'bg-orange-300',H:'bg-blue-300',
  A:'bg-red-400',AAA:'bg-red-600',AA:'bg-red-300',
  HA:'bg-yellow-400',LC:'bg-yellow-300',EG:'bg-yellow-200',
};

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export default function WeeklyAttendancePage() {
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [records, setRecords]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().split('T')[0], day: d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric'}) };
  });

  useEffect(() => {
    setLoading(true);
    fetch(\`/api/attendance/weekly?weekStart=\${weekStart}\`)
      .then(r => r.json()).then(d => { setRecords(d); setLoading(false); });
  }, [weekStart]);

  // Group by employee
  const byEmp = new Map<string, any>();
  records.forEach(r => {
    if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { employee: r.employee, days: {} });
    byEmp.get(r.employee_id).days[r.date] = r;
  });

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d.toISOString().split('T')[0]); }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d.toISOString().split('T')[0]); }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Weekly Attendance</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-3 py-2 border rounded-lg text-sm">←</button>
          <span className="text-sm font-medium px-3">{weekStart} → {weekDates[6].date}</span>
          <button onClick={nextWeek} className="px-3 py-2 border rounded-lg text-sm">→</button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-48">Employee</th>
                {weekDates.map(d => (
                  <th key={d.date} className="px-2 py-3 text-center text-sm font-medium text-gray-600">{d.day}</th>
                ))}
                <th className="px-2 py-3 text-center text-sm font-medium text-gray-600">Red Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...byEmp.entries()].map(([empId, { employee, days }]) => {
                const weekRM = weekDates.reduce((s, d) => s + (days[d.date]?.red_marks_total ?? 0), 0);
                return (
                  <tr key={empId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={\`/attendance/\${empId}\`} className="hover:text-green-700">
                        <div className="font-medium text-sm">{employee?.first_name} {employee?.last_name}</div>
                        <div className="text-xs text-gray-400">{employee?.employee_no}</div>
                      </Link>
                    </td>
                    {weekDates.map(d => {
                      const rec = days[d.date];
                      const status = rec?.status ?? '';
                      return (
                        <td key={d.date} className="px-2 py-3 text-center">
                          <span className={\`inline-block px-2 py-0.5 rounded text-xs font-medium text-white \${STATUS_COLORS[status] ?? 'bg-gray-200 text-gray-500'}\`}>
                            {status || '—'}
                          </span>
                          {rec && (rec.red_marks_morning > 0 || rec.red_marks_evening > 0) && (
                            <div className="text-xs text-red-500 mt-0.5">
                              {rec.red_marks_morning > 0 && \`M:\${rec.red_marks_morning}\`}
                              {rec.red_marks_evening > 0 && \` E:\${rec.red_marks_evening}\`}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-3 text-center">
                      <span className={\`font-medium \${weekRM > 0 ? 'text-red-600' : 'text-gray-400'}\`}>{weekRM || '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// PAGE: ATTENDANCE — Individual employee view
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/attendance/[employeeId]/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-100 text-green-800',PL:'bg-teal-100 text-teal-800',
  HPL:'bg-teal-50 text-teal-700',UL:'bg-orange-100 text-orange-800',
  HUL:'bg-orange-50 text-orange-700',H:'bg-blue-100 text-blue-700',
  A:'bg-red-100 text-red-700',AAA:'bg-red-200 text-red-900',
  AA:'bg-red-100 text-red-800',HA:'bg-yellow-100 text-yellow-800',
  LC:'bg-yellow-50 text-yellow-700',EG:'bg-yellow-50 text-yellow-700',
};

export default function EmployeeAttendancePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const router  = useRouter();
  const now     = new Date();
  const [month, setMonth]         = useState(\`\${now.getFullYear()}-\${String(now.getMonth()+1).padStart(2,'0')}\`);
  const [records, setRecords]     = useState<any[]>([]);
  const [employee, setEmployee]   = useState<any>(null);
  const [balance, setBalance]     = useState<any>(null);
  const [correcting, setCorrecting] = useState<any>(null);
  const [corrForm, setCorrForm]   = useState({ newStatus:'P', correctionType:'biometric_failure', reason:'' });

  useEffect(() => {
    fetch(\`/api/attendance/monthly?month=\${month}&employeeId=\${employeeId}\`)
      .then(r => r.json()).then(setRecords);
    fetch(\`/api/leave/balance?employeeId=\${employeeId}\`)
      .then(r => r.json()).then(setBalance);
    fetch(\`/api/employees/\${employeeId}\`).then(r => r.json()).then(setEmployee);
  }, [month, employeeId]);

  async function submitCorrection() {
    const res = await fetch('/api/attendance/correct', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        employeeId, date: correcting.date,
        newStatus: corrForm.newStatus,
        correctionType: corrForm.correctionType,
        reason: corrForm.reason,
        correctedBy: 'admin', // TODO: use actual logged-in user ID
      }),
    });
    if ((await res.json()).success) {
      setCorrecting(null);
      fetch(\`/api/attendance/monthly?month=\${month}&employeeId=\${employeeId}\`).then(r=>r.json()).then(setRecords);
    }
  }

  const totalP  = records.filter(r => ['P','LC','EG'].includes(r.status)).length;
  const totalRM = records.reduce((s,r) => s + (r.red_marks_total??0), 0);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>

      {employee && (
        <div className="flex items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{employee.first_name} {employee.last_name}</h1>
            <div className="text-gray-500 text-sm">{employee.employee_no} · {employee.department} · {employee.employment_type}</div>
          </div>
          <div className="ml-auto bg-green-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{balance?.pl_balance ?? 0}</div>
            <div className="text-xs text-gray-500">PL Balance</div>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{totalRM}</div>
            <div className="text-xs text-gray-500">Red Marks</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm" />
        <span className="text-sm text-gray-500">{totalP} days present this month</span>
      </div>

      <div className="bg-white border rounded-xl divide-y">
        {records.map(rec => (
          <div key={rec.date} className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium w-24">{new Date(rec.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',weekday:'short'})}</div>
              <span className={\`px-2 py-0.5 rounded text-xs font-medium \${STATUS_COLORS[rec.status] ?? 'bg-gray-100 text-gray-500'}\`}>
                {rec.status}
              </span>
              {rec.is_manually_corrected && <span className="text-xs text-blue-500">(corrected)</span>}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {rec.check_in && <span>{new Date(rec.check_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}</span>}
              {rec.check_out && <span>→ {new Date(rec.check_out).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}</span>}
              {rec.hours_worked && <span>{rec.hours_worked.toFixed(1)}h</span>}
              {rec.red_marks_total > 0 && <span className="text-red-500">⚑ {rec.red_marks_total} mark(s)</span>}
              <button onClick={() => setCorrecting(rec)} className="text-xs text-blue-600 hover:underline">Correct</button>
            </div>
          </div>
        ))}
      </div>

      {/* Correction modal */}
      {correcting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">Correct Attendance — {correcting.date}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Correct status to</label>
                <select value={corrForm.newStatus} onChange={e => setCorrForm(f => ({...f, newStatus: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {['P','PL','HPL','UL','HUL','H','A','AAA','AA','LC','EG'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Correction Type (mandatory)</label>
                <select value={corrForm.correctionType} onChange={e => setCorrForm(f => ({...f, correctionType: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="biometric_failure">Biometric Failure</option>
                  <option value="approved_leave_not_captured">Approved Leave Not Captured</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Reason (mandatory)</label>
                <textarea value={corrForm.reason} onChange={e => setCorrForm(f => ({...f, reason: e.target.value}))}
                  className="w-full border rounded-lg p-2.5 text-sm" rows={3}
                  placeholder="Explain the reason for correction..." />
              </div>
              {correcting.is_manually_corrected && (
                <p className="text-xs text-gray-500">Previous correction: {correcting.correction_reason}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={submitCorrection} className="flex-1 py-2.5 bg-green-700 text-white rounded-lg text-sm font-medium">
                  Save Correction
                </button>
                <button onClick={() => setCorrecting(null)} className="flex-1 py-2.5 border rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`);


// ═══════════════════════════════════════════════════════════════
// PAGE: TIME OFF PERMISSION
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/time-off/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function TimeOffPage() {
  const [perms, setPerms] = useState<any[]>([]);
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(\`/api/time-off?date=\${date}\`).then(r => r.json()).then(d => { setPerms(d); setLoading(false); });
  }, [date]);

  const STATUS: Record<string,string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Returned: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Time Off Permissions</h1>
        <Link href="/time-off/apply" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New Request
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">Date:</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : perms.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No time-off permissions for this date.</div>
      ) : (
        <div className="space-y-3">
          {perms.map(p => (
            <div key={p.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{p.employee?.first_name} {p.employee?.last_name}
                    <span className="text-gray-400 text-sm ml-2">{p.employee?.employee_no}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Out: <strong>{p.time_out}</strong>
                    {p.time_in_expected && <span> · Expected back: <strong>{p.time_in_expected}</strong></span>}
                    {p.time_in_actual  && <span> · Returned: <strong>{p.time_in_actual}</strong></span>}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{p.purpose}</div>
                </div>
                <span className={\`px-3 py-1 rounded-full text-xs font-medium \${STATUS[p.status] ?? 'bg-gray-100 text-gray-600'}\`}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`);

write('app/(dashboard)/time-off/apply/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

export default function ApplyTimeOffPage() {
  const router  = useRouter();
  const [empId, setEmpId] = useState('');
  const [form, setForm]   = useState({ date: new Date().toISOString().split('T')[0], timeOut: '', timeInExpected: '', purpose: '' });
  const [loading, setLoading] = useState(false);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('user_accounts').select('employee_id').eq('id', data.user.id).single()
        .then(({ data: ua }) => { if (ua) setEmpId(ua.employee_id); });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/time-off', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ employeeId: empId, ...form }),
    });
    if ((await res.json()).success) router.push('/time-off');
    else setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold mb-6">Request Time Off Permission</h1>
      <p className="text-sm text-gray-500 mb-6">For personal reasons during shift. Your supervisor will be notified for approval. Security will see the approved pass.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Out</label>
            <input type="time" value={form.timeOut} onChange={e => setForm(f => ({...f, timeOut: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Return</label>
            <input type="time" value={form.timeInExpected} onChange={e => setForm(f => ({...f, timeInExpected: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
          <textarea value={form.purpose} onChange={e => setForm(f => ({...f, purpose: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" rows={3} required placeholder="Reason for leaving during shift..." />
        </div>
        <button type="submit" disabled={loading} className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// PAGE: ON DUTY
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/on-duty/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function OnDutyPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/on-duty').then(r => r.json()).then(d => { setRecords(d); setLoading(false); });
  }, []);

  const STATUS: Record<string,string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Returned: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">On Duty — Official Movement</h1>
        <Link href="/on-duty/apply" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New On Duty
        </Link>
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No on duty records.</div>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <div key={r.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{r.employee?.first_name} {r.employee?.last_name}
                    <span className="text-gray-400 text-sm ml-2">{r.employee?.employee_no}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {r.date} · Out: {r.time_out ?? '?'} · Location: {r.location_to_visit}
                  </div>
                  <div className="text-sm text-gray-500">{r.purpose}</div>
                  {r.vehicle_type && <div className="text-xs text-gray-400">{r.vehicle_type}: {r.vehicle_number}</div>}
                  {r.outward_km && <div className="text-xs text-gray-400">KM Out: {r.outward_km}{r.inward_km ? \` · In: \${r.inward_km} · Total: \${r.total_km}\` : ''}</div>}
                </div>
                <span className={\`px-3 py-1 rounded-full text-xs font-medium \${STATUS[r.status] ?? 'bg-gray-100'}\`}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`);

write('app/(dashboard)/on-duty/apply/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

export default function ApplyOnDutyPage() {
  const router = useRouter();
  const [empId, setEmpId] = useState('');
  const [form, setForm]   = useState({
    date: new Date().toISOString().split('T')[0], timeOut: '', timeInPlanned: '',
    purpose: '', locationToVisit: '', vehicleType: 'Personal', vehicleNumber: '',
    outwardKm: '', projectSite: '',
  });
  const [loading, setLoading] = useState(false);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('user_accounts').select('employee_id').eq('id', data.user.id).single()
        .then(({ data: ua }) => { if (ua) setEmpId(ua.employee_id); });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    const res = await fetch('/api/on-duty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, ...form, outwardKm: form.outwardKm ? Number(form.outwardKm) : null }),
    });
    if ((await res.json()).success) router.push('/on-duty');
    else setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold mb-6">On Duty Request</h1>
      <p className="text-sm text-gray-500 mb-6">For official company work outside factory. Must be approved before leaving. Security will verify the pass.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: 'Date', key: 'date', type: 'date' },
          { label: 'Time Out', key: 'timeOut', type: 'time' },
          { label: 'Expected Return', key: 'timeInPlanned', type: 'time' },
          { label: 'Location to Visit', key: 'locationToVisit', type: 'text', placeholder: 'Destination address' },
          { label: 'Purpose', key: 'purpose', type: 'text', placeholder: 'Reason for official visit' },
          { label: 'Project Site (optional)', key: 'projectSite', type: 'text', placeholder: 'If visiting a project site' },
          { label: 'Odometer (Outward KM)', key: 'outwardKm', type: 'number', placeholder: 'Odometer reading at departure' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input type={type} value={(form as any)[key]} placeholder={placeholder}
              onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
              className="w-full border rounded-lg p-2.5 text-sm"
              required={['date','timeOut','locationToVisit','purpose'].includes(key)} />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
          <div className="flex gap-2">
            {['Personal','Company'].map(v => (
              <button type="button" key={v} onClick={() => setForm(f => ({...f, vehicleType: v}))}
                className={\`flex-1 py-2 rounded-lg border text-sm \${form.vehicleType === v ? 'border-green-500 bg-green-50' : 'border-gray-200'}\`}>{v}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
          <input type="text" value={form.vehicleNumber} placeholder="GJ-01-AB-1234"
            onChange={e => setForm(f => ({...f, vehicleNumber: e.target.value}))}
            className="w-full border rounded-lg p-2.5 text-sm" />
        </div>
        <button type="submit" disabled={loading} className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
          {loading ? 'Submitting...' : 'Submit On Duty Request'}
        </button>
      </form>
    </div>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// PAGE: PAYROLL REPORT
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/payroll/page.tsx', `
'use client';
import { useState } from 'react';

export default function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(\`\${now.getFullYear()}-\${String(now.getMonth()+1).padStart(2,'0')}\`);
  const [downloading, setDownloading] = useState(false);

  async function downloadReport() {
    setDownloading(true);
    const res = await fetch(\`/api/payroll/report?month=\${month}\`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = \`payroll-\${month}.xlsx\`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Payroll Report</h1>

      <div className="bg-white border rounded-xl p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border rounded-lg px-4 py-2.5 text-sm w-full" />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600">
          <p className="font-medium text-gray-800 mb-2">Report includes per employee:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Days Present, PL used, UL days, Holidays, Absents</li>
            <li>AAA count + deduction (3 days each)</li>
            <li>AA count + deduction (2 days each)</li>
            <li>Red mark count + ₹ deduction (Section 6 formula)</li>
            <li>Loan deduction (if active loan)</li>
            <li>Net working days</li>
          </ul>
        </div>

        <button onClick={downloadReport} disabled={downloading}
          className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60 flex items-center justify-center gap-2">
          {downloading ? 'Generating...' : (
            <>
              <span>📊</span>
              Download Payroll Report — {month}
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Excel file ready for Kiran/Neal in accounts
        </p>
      </div>

      {/* Year-end actions (show in March) */}
      {new Date().getMonth() === 2 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="font-semibold text-amber-900 mb-2">⚠️ March Year-End Actions</h2>
          <p className="text-sm text-amber-800 mb-4">
            April 1 is approaching. All unused PL balances will lapse on March 31.
            NO encashment — this is permanent company policy.
          </p>
          <button onClick={async () => {
            if (!confirm('Zero all PL balances for FY end? This cannot be undone.')) return;
            await fetch('/api/cron/year-end', { method: 'GET', headers: { 'x-cron-secret': 'admin' } });
            alert('Year-end processing complete.');
          }} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium">
            Run Year-End PL Lapse
          </button>
        </div>
      )}
    </div>
  );
}
`);


// ═══════════════════════════════════════════════════════════════
// API: EMPLOYEES — Individual fetch (used by attendance pages)
// ═══════════════════════════════════════════════════════════════
write('app/api/employees/[id]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabase
    .from('employees')
    .select(\`
      id, employee_no, first_name, last_name, department, location,
      employment_type, date_of_joining, shift_id, daily_salary_rate, status,
      phone, photo_url, reporting_manager_id,
      shifts:shift_id(name, start_time, end_time),
      manager:reporting_manager_id(first_name, last_name, employee_no)
    \`)
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const allowed = ['daily_salary_rate', 'shift_id', 'reporting_manager_id', 'phone', 'department', 'location'];
  const updates: any = {};
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
`);

// ═══════════════════════════════════════════════════════════════
// PAGE: ATTENDANCE — Main page with Today / Weekly / Monthly tabs
// ═══════════════════════════════════════════════════════════════
write('app/(dashboard)/attendance/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-100 text-green-800',PL:'bg-teal-100 text-teal-800',
  HPL:'bg-teal-50 text-teal-700',UL:'bg-orange-100 text-orange-800',
  HUL:'bg-orange-50 text-orange-700',H:'bg-blue-100 text-blue-700',
  A:'bg-red-100 text-red-700',AAA:'bg-red-200 text-red-900',
  AA:'bg-red-100 text-red-800',HA:'bg-yellow-100 text-yellow-800',
  LC:'bg-yellow-50 text-yellow-700',EG:'bg-yellow-50 text-yellow-700',
  AAA_PENDING:'bg-gray-100 text-gray-500',
};

export default function AttendancePage() {
  const router = useRouter();
  const [tab, setTab]           = useState('today');
  const [todayRecs, setTodayRecs] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch]     = useState('');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (tab === 'today') {
      setLoading(true);
      fetch(\`/api/attendance/monthly?month=\${today.slice(0,7)}\`)
        .then(r => r.json())
        .then(d => {
          setTodayRecs(d.filter((r: any) => r.date === today));
          setLoading(false);
        });
    }
  }, [tab, today]);

  async function runAttendanceNow() {
    setProcessing(true);
    const res  = await fetch('/api/cron/process-attendance', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date: today }) });
    const data = await res.json();
    alert(\`Processed \${data.processed} employees. Errors: \${data.errors?.length ?? 0}\`);
    setProcessing(false);
    fetch(\`/api/attendance/monthly?month=\${today.slice(0,7)}\`)
      .then(r => r.json())
      .then(d => setTodayRecs(d.filter((r: any) => r.date === today)));
  }

  const filtered = search
    ? todayRecs.filter(r =>
        \`\${r.employee?.first_name} \${r.employee?.last_name} \${r.employee?.employee_no}\`
          .toLowerCase().includes(search.toLowerCase()))
    : todayRecs;

  const stats = {
    P: filtered.filter(r => r.status === 'P').length,
    A: filtered.filter(r => ['A','AAA'].includes(r.status)).length,
    PL: filtered.filter(r => r.status === 'PL').length,
    H: filtered.filter(r => r.status === 'H').length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <button onClick={runAttendanceNow} disabled={processing}
          className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
          {processing ? 'Processing...' : '▶ Process Today'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[['today','Today'],['weekly','Weekly'],['monthly','Monthly']].map(([key, label]) => (
          <button key={key}
            onClick={() => key !== 'today' ? router.push(\`/attendance/\${key}\`) : setTab(key)}
            className={\`px-4 py-2 rounded-md text-sm font-medium \${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}\`}>
            {label}
          </button>
        ))}
      </div>

      {/* Today stat cards */}
      {tab === 'today' && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label:'Present', count: stats.P, color:'text-green-700 bg-green-50 border-green-200' },
              { label:'Absent', count: stats.A, color:'text-red-700 bg-red-50 border-red-200' },
              { label:'On Leave', count: stats.PL, color:'text-teal-700 bg-teal-50 border-teal-200' },
              { label:'Holiday', count: stats.H, color:'text-blue-700 bg-blue-50 border-blue-200' },
            ].map(s => (
              <div key={s.label} className={\`rounded-xl border p-4 \${s.color}\`}>
                <div className="text-3xl font-bold">{s.count}</div>
                <div className="text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <input type="text" placeholder="Search employee..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="border rounded-lg px-4 py-2.5 text-sm w-full max-w-sm" />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : (
            <div className="bg-white border rounded-xl divide-y">
              {filtered.map(rec => (
                <Link key={rec.employee_id} href={\`/attendance/\${rec.employee_id}\`}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {rec.employee?.first_name?.[0]}{rec.employee?.last_name?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{rec.employee?.first_name} {rec.employee?.last_name}</div>
                        <div className="text-xs text-gray-400">{rec.employee?.employee_no}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {rec.check_in && (
                        <span className="text-xs text-gray-500">
                          {new Date(rec.check_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}
                        </span>
                      )}
                      <span className={\`px-2 py-0.5 rounded text-xs font-medium \${STATUS_COLORS[rec.status] ?? 'bg-gray-100 text-gray-500'}\`}>
                        {rec.status}
                      </span>
                      {rec.red_marks_total > 0 && (
                        <span className="text-xs text-red-500">⚑ {rec.red_marks_total}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-400">
                  No records. Click "Process Today" to generate attendance.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// COMPONENT: Sidebar nav — updated with all Phase 2 links
// ═══════════════════════════════════════════════════════════════
write('components/nav/sidebar.tsx', `
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  {
    group: 'Attendance',
    items: [
      { href: '/attendance',         label: 'Today', icon: '📍' },
      { href: '/attendance/weekly',  label: 'Weekly', icon: '📅' },
      { href: '/attendance/monthly', label: 'Monthly', icon: '🗓' },
    ],
  },
  {
    group: 'Leave',
    items: [
      { href: '/leave',       label: 'Leave Requests', icon: '📋' },
      { href: '/leave/apply', label: 'Apply Leave',    icon: '✍️' },
    ],
  },
  {
    group: 'Movement',
    items: [
      { href: '/time-off',       label: 'Time Off',    icon: '🚪' },
      { href: '/on-duty',        label: 'On Duty',     icon: '🚗' },
    ],
  },
  {
    group: 'Payroll',
    items: [
      { href: '/payroll', label: 'Payroll Report', icon: '💰' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { href: '/employees', label: 'Employees', icon: '👥' },
      { href: '/biometric', label: 'Biometric Sync', icon: '👆' },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-white border-r flex flex-col py-4">
      <div className="px-4 mb-6">
        <div className="text-green-800 font-bold text-lg">Comfy Works</div>
        <div className="text-gray-400 text-xs">Factory HR</div>
      </div>

      <nav className="flex-1 px-2 space-y-6">
        {NAV.map(section => (
          <div key={section.group}>
            <div className="px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {section.group}
            </div>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = path === item.href || (item.href !== '/' && path.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}
                    className={\`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition \${
                      active ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-600 hover:bg-gray-50'
                    }\`}>
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 pt-4 border-t">
        <div className="text-xs text-gray-400 text-center">Comfy Furniture Centre</div>
      </div>
    </aside>
  );
}
`);

// ═══════════════════════════════════════════════════════════════
// VERCEL.JSON — Cron jobs
// ═══════════════════════════════════════════════════════════════
write('vercel.json', `{
  "crons": [
    {
      "path": "/api/cron/process-attendance",
      "schedule": "30 18 * * *"
    },
    {
      "path": "/api/cron/monthly-accrual",
      "schedule": "0 2 1 * *"
    },
    {
      "path": "/api/cron/year-end",
      "schedule": "0 0 1 4 *"
    }
  ]
}
`);

// ═══════════════════════════════════════════════════════════════
// SQL MIGRATION — All new columns + indexes + functions
// ═══════════════════════════════════════════════════════════════
write('supabase/migrations/phase2.sql', `
-- ═══════════════════════════════════════════════════════
-- Comfy Works Phase 2 — SQL Migration
-- Run in Supabase SQL Editor before deploying Phase 2
-- ═══════════════════════════════════════════════════════

-- 1. leave_requests: add 3-step approval chain columns
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS l3_approver_id        uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS l3_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS l3_comment            text,
  ADD COLUMN IF NOT EXISTS approval_token        text,
  ADD COLUMN IF NOT EXISTS chain_type            text CHECK (chain_type IN ('2step','3step')),
  ADD COLUMN IF NOT EXISTS notice_violation      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_retroactive        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pl_to_deduct          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_by           uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS rejected_at           timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason      text,
  ADD COLUMN IF NOT EXISTS out_of_station        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_station_contact text,
  ADD COLUMN IF NOT EXISTS out_of_station_address text;

-- 2. attendance_daily: add correction tracking columns
ALTER TABLE attendance_daily
  ADD COLUMN IF NOT EXISTS is_manually_corrected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_reason     text,
  ADD COLUMN IF NOT EXISTS corrected_by          text,
  ADD COLUMN IF NOT EXISTS corrected_at          timestamptz,
  ADD COLUMN IF NOT EXISTS original_status       text,
  ADD COLUMN IF NOT EXISTS leave_id              uuid REFERENCES leave_requests(id);

-- 3. employees: ensure daily salary rate column exists
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS daily_salary_rate     numeric;

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_leave_approval_token ON leave_requests(approval_token);
CREATE INDEX IF NOT EXISTS idx_leave_status         ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_employee       ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_date_range     ON leave_requests(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_att_daily_date       ON attendance_daily(date);
CREATE INDEX IF NOT EXISTS idx_att_daily_emp_date   ON attendance_daily(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_att_daily_status     ON attendance_daily(status);

-- 5. Atomic PL deduction function (race-condition safe)
CREATE OR REPLACE FUNCTION increment_pl_used(
  p_employee_id   uuid,
  p_financial_year text,
  p_amount        numeric
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO leave_balances (employee_id, financial_year, pl_earned, pl_used)
  VALUES (p_employee_id, p_financial_year, 0, p_amount)
  ON CONFLICT (employee_id, financial_year)
  DO UPDATE SET pl_used = leave_balances.pl_used + p_amount;
$$;

-- 6. View: PL balance computed automatically
CREATE OR REPLACE VIEW leave_balances_view AS
SELECT
  lb.*,
  lb.pl_earned - lb.pl_used AS pl_balance
FROM leave_balances lb;

-- 7. Monthly red marks summary view (for payroll)
CREATE OR REPLACE VIEW monthly_red_marks_summary AS
SELECT
  employee_id,
  DATE_TRUNC('month', date::date) AS month,
  SUM(red_marks_morning) AS total_morning_marks,
  SUM(red_marks_evening) AS total_evening_marks,
  SUM(red_marks_total)   AS total_marks
FROM attendance_daily
GROUP BY employee_id, DATE_TRUNC('month', date::date);

-- 8. Ensure leave_balances has unique constraint
ALTER TABLE leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_emp_fy_unique;
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_emp_fy_unique UNIQUE (employee_id, financial_year);

-- 9. Update status check on leave_requests to allow Pending and all intermediate statuses
-- (existing check should already have these; if not, run:)
-- ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
-- ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check
--   CHECK (status IN ('Pending','L1_Approved','L2_Approved','Approved','Rejected','Cancelled'));

-- 10. Leave balances for current FY for all active employees (if missing)
INSERT INTO leave_balances (employee_id, financial_year, pl_earned, pl_used)
SELECT
  id,
  CASE WHEN EXTRACT(month FROM NOW()) >= 4
    THEN EXTRACT(year FROM NOW())::text || '-' || RIGHT((EXTRACT(year FROM NOW()) + 1)::text, 2)
    ELSE (EXTRACT(year FROM NOW()) - 1)::text || '-' || RIGHT(EXTRACT(year FROM NOW())::text, 2)
  END,
  0,
  0
FROM employees
WHERE status = 'Active'
ON CONFLICT (employee_id, financial_year) DO NOTHING;
`);

// ═══════════════════════════════════════════════════════════════
// WHATSAPP TEMPLATES — Submit these to Meta for approval
// ═══════════════════════════════════════════════════════════════
write('docs/whatsapp-templates.md', `
# WhatsApp Templates — Submit to Meta for Approval

After setting up Meta Developer App, submit these 5 templates.
Category: **UTILITY** for all.
Language: **English (en)**

---

## 1. comfy_leave_approval
**To:** L1 / L2 / L3 Approver
**Purpose:** New leave request pending action

**Body:**
> {{1}} has applied for {{2}} leave.
> Dates: {{3}} to {{4}} ({{5}} days)
> Reason: {{6}}
> PL Balance after this leave: {{7}} days
> 
> ⚡ TAP TO REVIEW & APPROVE/REJECT (expires in 7 days):
> {{8}}

**Parameter mapping:**
1. Employee full name
2. Leave type (PL / UL / HPL / HUL / LC / EG)
3. Date from
4. Date to
5. Number of days
6. Reason (truncated to 200 chars)
7. Remaining PL balance
8. One-tap approval URL

---

## 2. comfy_leave_decision
**To:** Employee who applied
**Purpose:** Leave approved or rejected

**Body:**
> Your {{1}} leave request ({{2}} to {{3}}) has been *{{4}}*.
> {{5}}
>
> — Comfy Works HR

**Parameter mapping:**
1. Leave type
2. Date from
3. Date to
4. APPROVED or REJECTED
5. Comment from approver (or "Your leave has been sanctioned." / "Please contact HR for details.")

---

## 3. comfy_time_off_approved
**To:** Employee's supervisor / security gate
**Purpose:** Time off permission pass

**Body:**
> 🟢 TIME OFF PASS
> Employee: {{1}}
> Leaving at: {{2}} on {{3}}
> Purpose: {{4}}
> Expected return: {{5}}
>
> — Comfy Works Factory Gate Pass

**Parameter mapping:**
1. Employee full name
2. Time out
3. Date
4. Purpose
5. Expected return time

---

## 4. comfy_on_duty_approved
**To:** Employee + Security
**Purpose:** On Duty official movement pass

**Body:**
> ✅ ON DUTY — OFFICIAL MOVEMENT
> {{1}} is authorised to leave for official duty.
> Date: {{2}} | Departure: {{3}}
> Location: {{4}}
> Vehicle: {{5}}
> Approved by: {{6}}
>
> — Comfy Works HR

**Parameter mapping:**
1. Employee full name
2. Date
3. Time out
4. Location to visit
5. Vehicle type + number (e.g. "Personal: GJ-01-AB-1234")
6. Approver name

---

## 5. comfy_aaa_alert
**To:** Kush (CF-004) — Escalation alert
**Purpose:** Employee absent without approval

**Body:**
> ⚠️ AAA ALERT — Comfy Works
> {{1}} was absent without any approved leave on {{2}}.
> Status: AAA (3 days salary deduction applied).
>
> If this is incorrect, correct via Comfy Works attendance module.

**Parameter mapping:**
1. Employee full name
2. Date (or date range)

---

## Setup steps
1. Go to https://business.facebook.com → More Tools → WhatsApp Manager
2. Account Tools → Message Templates → Create Template
3. Submit all 5 templates above
4. Approval typically takes 24–48 hours
5. Once approved, add to Vercel environment:
   \`\`\`
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_ACCESS_TOKEN=your_system_user_token
   \`\`\`
`);

// ═══════════════════════════════════════════════════════════════
// ENV VARS TEMPLATE
// ═══════════════════════════════════════════════════════════════
write('docs/env-phase2.md', `
# Phase 2 Environment Variables

Add these to Vercel → Project Settings → Environment Variables.
Also add to your local .env.local for development.

## New in Phase 2

\`\`\`bash
# WhatsApp — Meta Cloud API (get from developers.facebook.com)
WHATSAPP_PHONE_NUMBER_ID=   # e.g. 123456789012345
WHATSAPP_ACCESS_TOKEN=      # System User token (never expires if set up correctly)

# App URL (for one-tap approval links in WhatsApp messages)
NEXT_PUBLIC_APP_URL=https://comfy-works-git-main-infinityinnovations.vercel.app

# Cron security secret (any random string, used to authenticate cron calls)
CRON_SECRET=comfyworks_cron_$(date +%s)
\`\`\`

## Already set (Phase 1)

\`\`\`bash
NEXT_PUBLIC_SUPABASE_URL=https://ysgorgedevhkrhsvkvcc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
\`\`\`

## How to generate CRON_SECRET
Run in terminal: \`openssl rand -hex 32\`
Or use any long random string.
`);

// ═══════════════════════════════════════════════════════════════
// README — Run order and deployment guide
// ═══════════════════════════════════════════════════════════════
write('docs/phase2-deploy.md', `
# Phase 2 Deployment Guide

## Run Order

### Step 1 — Run the SQL migration
1. Open: https://supabase.com/dashboard/project/ysgorgedevhkrhsvkvcc/sql
2. Paste contents of: \`supabase/migrations/phase2.sql\`
3. Click Run

### Step 2 — Set up daily_salary_rate for employees
After running migration, set each employee's daily rate in Supabase:
\`\`\`sql
-- Example: update daily salary rate for all employees
-- You need to enter actual values per employee
UPDATE employees SET daily_salary_rate = monthly_salary / 26 WHERE monthly_salary IS NOT NULL;
-- Or manually per employee via the Supabase table editor
\`\`\`

### Step 3 — Generate the files
\`\`\`bash
cd C:\\Users\\Dell\\comfy-works
node setup-phase2.js
\`\`\`

### Step 4 — Install new dependency (xlsx for payroll export)
\`\`\`bash
npm install xlsx
\`\`\`

### Step 5 — Add environment variables to Vercel
See: \`docs/env-phase2.md\`
Add via: https://vercel.com/infinityinnovationsindia/comfy-works/settings/environment-variables

### Step 6 — Deploy
\`\`\`bash
git add -A
git commit -m "feat: Phase 2 — daily operations (attendance, leave, payroll)"
git push origin main
\`\`\`
Vercel auto-deploys on push.

### Step 7 — Set up WhatsApp (can do after deploy)
Follow: \`docs/whatsapp-templates.md\`
1. Create Meta Developer App
2. Add WhatsApp product
3. Get a dedicated phone number
4. Submit 5 templates for approval (24-48hrs)
5. Generate System User token
6. Add WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN to Vercel

### Step 8 — Test attendance processing
In Vercel → Functions → Cron Jobs → Trigger manually
Or call: POST https://comfy-works-git-main-infinityinnovations.vercel.app/api/cron/process-attendance

### Step 9 — Set daily_salary_rate for each employee
Via app: Go to Employees → each employee → Edit → set Daily Rate (₹)
Or via Supabase table editor directly.

## Cron Schedule Summary
| Cron | Schedule | What it does |
|------|----------|--------------|
| /api/cron/process-attendance | 30 18 * * * | Daily at midnight IST — converts punches → attendance_daily |
| /api/cron/monthly-accrual | 0 2 1 * * | 1st of each month at 7:30am IST — adds PL accrual |
| /api/cron/year-end | 0 0 1 4 * | April 1 at 5:30am IST — zeroes all PL balances, no encashment |

## What WhatsApp does while NOT configured
All notification calls fall back to \`console.log\`.
Everything works — approvals still go through — just no WhatsApp messages.
Add the env vars whenever you're ready and it switches on automatically.
`);

// ═══════════════════════════════════════════════════════════════
// FINAL SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\\n' + '═'.repeat(65));
console.log('  COMFY WORKS — PHASE 2 SETUP COMPLETE');
console.log('═'.repeat(65));
console.log('\n  Total files created: ' + created);
console.log('\\n  ─── LIB FILES ────────────────────────────────────────────');
console.log('  ✓ lib/red-marks.ts             — Exact Section 6 formula');
console.log('  ✓ lib/leave-calculator.ts      — Sandwich rule + PL accrual');
console.log('  ✓ lib/attendance-processor.ts  — Core processing engine');
console.log('  ✓ lib/whatsapp.ts              — Meta Cloud API + fallback');
console.log('  ✓ lib/approval-tokens.ts       — Token gen + lookup');
console.log('  ✓ lib/approval-routing.ts      — 2-step / 3-step chain resolver');
console.log('\\n  ─── API ROUTES ───────────────────────────────────────────');
console.log('  ✓ /api/cron/process-attendance — Daily IST midnight cron');
console.log('  ✓ /api/cron/monthly-accrual    — 1st of month PL accrual');
console.log('  ✓ /api/cron/year-end           — April 1 PL lapse, NO encash');
console.log('  ✓ /api/leave/apply             — All 10 edge cases handled');
console.log('  ✓ /api/leave/[id]              — GET + POST approve/reject');
console.log('  ✓ /api/leave/balance           — Current FY PL balance');
console.log('  ✓ /api/leave/sandwich          — Sandwich rule calculator');
console.log('  ✓ /api/leave/pending           — Pending leaves by approver');
console.log('  ✓ /api/approve/[token]         — One-tap link (no login)');
console.log('  ✓ /api/attendance/correct      — Correction + audit log');
console.log('  ✓ /api/attendance/monthly      — Monthly data');
console.log('  ✓ /api/attendance/weekly       — Weekly data');
console.log('  ✓ /api/time-off + [id]         — Time Off CRUD');
console.log('  ✓ /api/on-duty + [id]          — On Duty CRUD + KM tracking');
console.log('  ✓ /api/payroll/report          — Excel export (xlsx)');
console.log('  ✓ /api/employees/[id]          — Employee fetch + PATCH');
console.log('\\n  ─── DASHBOARD PAGES ──────────────────────────────────────');
console.log('  ✓ /attendance                  — Today tab + process button');
console.log('  ✓ /attendance/weekly           — 7-day grid, red mark flags');
console.log('  ✓ /attendance/monthly          — Full calendar + payroll export');
console.log('  ✓ /attendance/[employeeId]     — Individual + correction modal');
console.log('  ✓ /leave                       — List with pending/mine tabs');
console.log('  ✓ /leave/apply                 — Full form, sandwich preview');
console.log('  ✓ /leave/[id]                  — Detail + approve/reject');
console.log('  ✓ /approve/[token]             — One-tap no-auth mobile page');
console.log('  ✓ /time-off + /time-off/apply  — Module 4');
console.log('  ✓ /on-duty  + /on-duty/apply   — Module 5 with KM');
console.log('  ✓ /payroll                     — Excel download + year-end');
console.log('\\n  ─── INFRA FILES ──────────────────────────────────────────');
console.log('  ✓ components/nav/sidebar.tsx   — Updated nav with all links');
console.log('  ✓ vercel.json                  — 3 cron jobs configured');
console.log('  ✓ supabase/migrations/phase2.sql');
console.log('  ✓ docs/whatsapp-templates.md   — 5 templates ready to submit');
console.log('  ✓ docs/env-phase2.md           — All env vars documented');
console.log('  ✓ docs/phase2-deploy.md        — Step-by-step deploy guide');
console.log('\\n  ─── NEXT STEPS ───────────────────────────────────────────');
console.log('  1. Run SQL migration in Supabase');
console.log('  2. npm install xlsx');
console.log('  3. node setup-phase2.js (this script)');
console.log('  4. Add 4 env vars to Vercel');
console.log('  5. git add -A && git commit -m "feat: phase 2" && git push');
console.log('  6. Set up WhatsApp (optional, works without it)');
console.log('═'.repeat(65) + '\\n');

