
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
    ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`;

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
