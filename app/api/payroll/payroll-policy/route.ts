import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { DEFAULT_PAYROLL_POLICY, type PayrollPolicy } from '@/lib/payroll-deduction';

function makeClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

async function getCallerRole(supabase: ReturnType<typeof makeClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: acc } = await supabase
    .from('user_accounts')
    .select('role, employee_id')
    .eq('id', user.id)
    .single();
  return acc;
}

export async function GET() {
  const supabase = makeClient();
  const { data, error } = await supabase
    .from('payroll_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return NextResponse.json(DEFAULT_PAYROLL_POLICY);
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = makeClient();

  const acc = await getCallerRole(supabase);
  if (!acc || acc.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only Super Admin can change payroll policy' }, { status: 403 });
  }

  const body = await request.json();

  // Validate every field
  const required: (keyof PayrollPolicy)[] = [
    'red_mark_threshold',
    'band1_rate_days', 'band1_per_marks', 'band1_max_marks',
    'band2_rate_days', 'band2_per_marks', 'band2_max_marks',
    'band3_rate_days', 'band3_per_marks',
  ];

  for (const key of required) {
    if (typeof body[key] !== 'number' || body[key] < 0 || !isFinite(body[key])) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
  }

  if (body.band1_max_marks >= body.band2_max_marks) {
    return NextResponse.json({ error: 'Band 2 max marks must be greater than Band 1 max marks' }, { status: 400 });
  }

  // Read current settings to push to history before overwrite
  const { data: oldData } = await supabase
    .from('payroll_settings')
    .select('*')
    .eq('id', 1)
    .single();

  // Insert into history (if old data existed)
  if (oldData) {
    await supabase.from('payroll_settings_history').insert({
      red_mark_threshold: oldData.red_mark_threshold,
      band1_rate_days: oldData.band1_rate_days,
      band1_per_marks: oldData.band1_per_marks,
      band1_max_marks: oldData.band1_max_marks,
      band2_rate_days: oldData.band2_rate_days,
      band2_per_marks: oldData.band2_per_marks,
      band2_max_marks: oldData.band2_max_marks,
      band3_rate_days: oldData.band3_rate_days,
      band3_per_marks: oldData.band3_per_marks,
      changed_by: oldData.updated_by,
      changed_at: oldData.updated_at,
    });
  }

  // Save new settings
  const { error } = await supabase
    .from('payroll_settings')
    .upsert({
      id: 1,
      red_mark_threshold: body.red_mark_threshold,
      band1_rate_days: body.band1_rate_days,
      band1_per_marks: body.band1_per_marks,
      band1_max_marks: body.band1_max_marks,
      band2_rate_days: body.band2_rate_days,
      band2_per_marks: body.band2_per_marks,
      band2_max_marks: body.band2_max_marks,
      band3_rate_days: body.band3_rate_days,
      band3_per_marks: body.band3_per_marks,
      updated_at: new Date().toISOString(),
      updated_by: acc.employee_id,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
