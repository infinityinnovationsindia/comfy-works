
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
  const prevFY = `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`;
  const newFY  = `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`;

  // Get all leave balances for previous FY with unused PL
  const { data: balances } = await supabase
    .from('leave_balances')
    .select('*, employee:employee_id(first_name, last_name, employee_no)')
    .eq('financial_year', prevFY)
    .gt('pl_balance', 0);

  const report = (balances ?? []).map(b => ({
    employee_no: b.employee?.employee_no,
    name: `${b.employee?.first_name} ${b.employee?.last_name}`,
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
