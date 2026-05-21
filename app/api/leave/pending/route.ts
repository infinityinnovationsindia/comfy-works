
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const approverId  = searchParams.get('approverId');
  const employeeId  = searchParams.get('employeeId');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let q = supabase
    .from('leave_requests')
    .select(`
      *, 
      employee:employee_id(first_name, last_name, employee_no, department),
      l1_approver:l1_approver_id(first_name, last_name),
      l2_approver:l2_approver_id(first_name, last_name),
      l3_approver:l3_approver_id(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (employeeId) q = q.eq('employee_id', employeeId);

  if (approverId) {
    q = q.or(
      `and(l1_approver_id.eq.${approverId},status.eq.Pending),` +
      `and(l2_approver_id.eq.${approverId},status.eq.L1_Approved),` +
      `and(l3_approver_id.eq.${approverId},status.eq.L2_Approved)`
    );
  }

  const { data } = await q;
  return NextResponse.json(data ?? []);
}
