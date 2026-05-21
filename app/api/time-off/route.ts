
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
          `${emp.first_name} ${emp.last_name}`,
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
