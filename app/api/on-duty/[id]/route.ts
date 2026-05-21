
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
