
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
