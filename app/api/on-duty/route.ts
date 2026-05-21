
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
        `${emp.first_name} ${emp.last_name}`,
        'Official Duty',
        body.date,
        body.timeOut,
        body.locationToVisit,
        `${body.vehicleType ?? 'N/A'}: ${body.vehicleNumber ?? 'N/A'}`,
        'Kush Patel',
      ]
    );
  }

  return NextResponse.json({ success: true, id: od.id });
}
