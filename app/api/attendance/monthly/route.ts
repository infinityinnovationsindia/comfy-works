
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
