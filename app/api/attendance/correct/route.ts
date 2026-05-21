
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const {
    attendanceId, employeeId, date,
    newStatus, correctionType, reason, correctedBy
  } = await request.json();

  if (!reason || reason.trim().length < 5) {
    return NextResponse.json({ error: 'Reason is mandatory and must be at least 5 characters.' }, { status: 400 });
  }

  const validTypes = ['biometric_failure', 'approved_leave_not_captured', 'other'];
  if (!validTypes.includes(correctionType)) {
    return NextResponse.json({ error: 'Invalid correction type.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get original record
  const { data: original } = await supabase
    .from('attendance_daily')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .single();

  if (!original) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });

  // Update record
  const { error: updateErr } = await supabase
    .from('attendance_daily')
    .update({
      status: newStatus,
      is_manually_corrected: true,
      correction_reason: reason,
      corrected_by: correctedBy,
      corrected_at: new Date().toISOString(),
      original_status: original.status,
    })
    .eq('employee_id', employeeId)
    .eq('date', date);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Write immutable audit log
  await supabase.from('audit_log').insert({
    table_name: 'attendance_daily',
    record_id: original.id,
    action: 'OVERRIDE',
    old_values: { status: original.status, check_in: original.check_in, check_out: original.check_out },
    new_values: { status: newStatus },
    changed_by: correctedBy,
    reason: `[${correctionType}] ${reason}`,
  });

  return NextResponse.json({ success: true });
}
