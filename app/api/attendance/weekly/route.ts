
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
