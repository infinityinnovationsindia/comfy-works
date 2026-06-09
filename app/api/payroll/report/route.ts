import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { redMarkDeductionDays } from '@/lib/red-marks';
import * as XLSX from 'xlsx';

/**
 * Payroll deductions now respect per-category policy:
 *   - category.half_day_unpaid  → if false, AA half-day is NOT deducted (paid)
 *   - category.holiday_paid     → if false, H day is NOT counted as paid working day
 *
 * Employees with no category fall back to spec defaults:
 *   half_day_unpaid = true (AA is deducted)
 *   holiday_paid    = false (holidays don't count toward paid days)
 */

const DEFAULT_POLICY = {
  half_day_unpaid: true,
  holiday_paid: false,
};

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

  // Load all active employees (now including category_id)
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employee_no, first_name, last_name, department, shift_id, category_id, daily_salary_rate, employment_type')
    .eq('status', 'Active')
    .order('employee_no');

  // Load categories once
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, code, half_day_unpaid, holiday_paid')
    .eq('is_active', true);
  const categoryMap = new Map((categories ?? []).map(c => [c.id, c]));

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

    // Resolve policy from category — fallback if unassigned
    const cat = emp.category_id ? categoryMap.get(emp.category_id) : null;
    const policy = {
      half_day_unpaid: cat?.half_day_unpaid ?? DEFAULT_POLICY.half_day_unpaid,
      holiday_paid:    cat?.holiday_paid    ?? DEFAULT_POLICY.holiday_paid,
    };
    const categoryLabel = cat?.code ?? '—';

    const daysPresent = empAtt.filter(a => a.status === 'P').length;
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

    // AAA always deducted (3 days each) — spec rule, not category-driven
    const aaaDedRs       = aaaCount * 3 * dailyRate;

    // AA deduction depends on category.half_day_unpaid
    // If unpaid: 2 days per AA per spec § 5.5
    // If paid:   0 (treated as a paid half-day)
    const aaDedRs        = policy.half_day_unpaid ? (aaCount * 2 * dailyRate) : 0;

    // Single-punch A always 1 day deduction — spec rule
    const absentDedRs    = absents  * 1 * dailyRate;
    const ulDedRs        = ulDays   * dailyRate;

    const loan = loanMap.get(emp.id);
    const loanDedRs = loan ? Math.min(loan.repayment_per_month, loan.outstanding_balance) : 0;

    const totalDeductionRs = redMarkDedRs + aaaDedRs + aaDedRs + absentDedRs + ulDedRs + loanDedRs;

    // Net working days = present + PL + (holidays only if paid for this category)
    const paidHolidays = policy.holiday_paid ? holidays : 0;
    const netWorkingDays = daysPresent + plUsed + paidHolidays;

    rows.push({
      'Emp No':              emp.employee_no,
      'Name':                `${emp.first_name} ${emp.last_name}`,
      'Department':          emp.department ?? '',
      'Category':            categoryLabel,
      'Type':                emp.employment_type,
      'Daily Rate (₹)':      dailyRate,
      'Present':             daysPresent,
      'PL Used':             plUsed,
      'UL Days':             ulDays,
      'Holidays':            holidays,
      'Holiday Paid?':       policy.holiday_paid ? 'Yes' : 'No',
      'Absents (A)':         absents,
      'AAA Count':           aaaCount,
      'AA Count':            aaCount,
      'AA Unpaid?':          policy.half_day_unpaid ? 'Yes' : 'No',
      'Red Marks':           totalRedMarks,
      'Red Mark Ded (Days)': redMarkDedDays,
      'Red Mark Ded (₹)':    redMarkDedRs.toFixed(2),
      'AAA Ded (₹)':         aaaDedRs.toFixed(2),
      'AA Ded (₹)':          aaDedRs.toFixed(2),
      'Absent Ded (₹)':      absentDedRs.toFixed(2),
      'UL Ded (₹)':          ulDedRs.toFixed(2),
      'Loan Ded (₹)':        loanDedRs.toFixed(2),
      'Total Deduction (₹)': totalDeductionRs.toFixed(2),
      'Net Working Days':    netWorkingDays,
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? {}).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, `Payroll ${month}`);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payroll-${month}.xlsx"`,
    },
  });
}
