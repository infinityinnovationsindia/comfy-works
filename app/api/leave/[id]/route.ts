
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyEmployeeDecision, notifyLeaveApprover, notifyKushAAA } from '@/lib/whatsapp';
import { generateToken } from '@/lib/approval-tokens';

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = adminSupabase();
  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      employee:employee_id(first_name, last_name, employee_no, department, location, phone),
      l1_approver:l1_approver_id(first_name, last_name),
      l2_approver:l2_approver_id(first_name, last_name),
      l3_approver:l3_approver_id(first_name, last_name)
    `)
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { action, approverId, comment } = await request.json();
  // action: 'approve' | 'reject'

  const supabase = adminSupabase();

  const { data: leave } = await supabase
    .from('leave_requests')
    .select(`
      *, 
      employee:employee_id(first_name, last_name, phone, employment_type),
      l1_approver:l1_approver_id(first_name, last_name, phone),
      l2_approver:l2_approver_id(first_name, last_name, phone),
      l3_approver:l3_approver_id(first_name, last_name, phone)
    `)
    .eq('id', params.id)
    .single();

  if (!leave) return NextResponse.json({ error: 'Leave not found' }, { status: 404 });

  const now = new Date().toISOString();

  if (action === 'reject') {
    await supabase.from('leave_requests').update({
      status: 'Rejected',
      rejected_by: approverId,
      rejected_at: now,
      rejection_reason: comment,
    }).eq('id', params.id);

    // ── EDGE CASE 6: Leave rejected + employee absent ─────────
    // Check if employee is already absent on those dates
    const { data: absences } = await supabase
      .from('attendance_daily')
      .select('date, status')
      .eq('employee_id', leave.employee_id)
      .gte('date', leave.date_from)
      .lte('date', leave.date_to)
      .in('status', ['AAA', 'AAA_PENDING', 'A']);

    if (absences && absences.length > 0) {
      // Auto-flag as AAA and alert Kush
      await supabase.from('attendance_daily')
        .update({ status: 'AAA' })
        .eq('employee_id', leave.employee_id)
        .in('date', absences.map(a => a.date));

      // Alert Kush
      const { data: kush } = await supabase
        .from('employees')
        .select('phone')
        .eq('employee_no', 'CF-004')
        .single();

      if (kush?.phone) {
        await notifyKushAAA({
          kushPhone: kush.phone.replace(/[^0-9]/g, ''),
          employeeName: `${leave.employee?.first_name} ${leave.employee?.last_name}`,
          date: `${leave.date_from} to ${leave.date_to}`,
        });
      }
    }

    // Notify employee
    if (leave.employee?.phone) {
      await notifyEmployeeDecision({
        employeePhone: leave.employee.phone.replace(/[^0-9]/g, ''),
        leaveType: leave.leave_type,
        dateFrom: leave.date_from,
        dateTo: leave.date_to,
        decision: 'Rejected',
        comment,
      });
    }

    return NextResponse.json({ success: true, status: 'Rejected' });
  }

  if (action === 'approve') {
    const status = leave.status;
    const chainType = leave.chain_type;

    let nextStatus: string;
    let nextApproverId: string | null = null;
    let nextApproverPhone: string | null = null;
    let finallyApproved = false;

    if (status === 'Pending') {
      // L1 approving
      await supabase.from('leave_requests').update({
        status: 'L1_Approved',
        l1_approved_at: now,
        l1_comment: comment,
      }).eq('id', params.id);
      nextStatus = 'L1_Approved';

      if (chainType === '2step') {
        // Next is L2 (Kush = final)
        nextApproverId = leave.l2_approver_id;
        nextApproverPhone = leave.l2_approver?.phone ?? null;
      } else {
        // 3-step: next is L2 (Shailoo)
        nextApproverId = leave.l2_approver_id;
        nextApproverPhone = leave.l2_approver?.phone ?? null;
      }

    } else if (status === 'L1_Approved') {
      await supabase.from('leave_requests').update({
        status: 'L2_Approved',
        l2_approved_at: now,
        l2_comment: comment,
      }).eq('id', params.id);
      nextStatus = 'L2_Approved';

      if (chainType === '2step') {
        // 2-step: L2 = Kush = final approval
        finallyApproved = true;
      } else {
        // 3-step: next is L3 (Kush)
        nextApproverId = leave.l3_approver_id;
        nextApproverPhone = leave.l3_approver?.phone ?? null;
      }

    } else if (status === 'L2_Approved') {
      // Only 3-step reaches here — L3 = Kush = final
      await supabase.from('leave_requests').update({
        status: 'Approved',
        l3_approved_at: now,
        l3_comment: comment,
      }).eq('id', params.id);
      finallyApproved = true;
    }

    if (finallyApproved) {
      // Final approval: update status to Approved
      await supabase.from('leave_requests').update({ status: 'Approved' }).eq('id', params.id);

      // Deduct PL balance
      if (['PL','HPL'].includes(leave.leave_type) && leave.pl_to_deduct > 0) {
        const fyNow = new Date().getMonth() >= 3
          ? `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`
          : `${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(2)}`;

        await supabase.rpc('increment_pl_used', {
          p_employee_id: leave.employee_id,
          p_financial_year: fyNow,
          p_amount: leave.pl_to_deduct,
        }).catch(() => {
          // Fallback: manual update
          supabase.from('leave_balances')
            .update({ pl_used: supabase.raw('pl_used + ' + leave.pl_to_deduct) })
            .eq('employee_id', leave.employee_id)
            .eq('financial_year', fyNow);
        });
      }

      // Update attendance_daily records for leave period (retroactive fix)
      const from = new Date(leave.date_from);
      const to   = new Date(leave.date_to);
      const cur  = new Date(from);
      while (cur <= to) {
        const dateStr = cur.toISOString().split('T')[0];
        await supabase.from('attendance_daily').upsert({
          employee_id: leave.employee_id,
          date: dateStr,
          status: leave.leave_type,
          leave_id: leave.id,
          check_in: null, check_out: null, hours_worked: null,
          red_marks_morning: 0, red_marks_evening: 0, red_marks_total: 0,
        }, { onConflict: 'employee_id,date' });
        cur.setDate(cur.getDate() + 1);
      }

      // ── EDGE CASE 9: March 31 check (handled by year-end cron) ──

      // Notify employee
      if (leave.employee?.phone) {
        await notifyEmployeeDecision({
          employeePhone: leave.employee.phone.replace(/[^0-9]/g, ''),
          leaveType: leave.leave_type,
          dateFrom: leave.date_from,
          dateTo: leave.date_to,
          decision: 'Approved',
        });
      }

      return NextResponse.json({ success: true, status: 'Approved' });
    }

    // Not finally approved — send to next approver
    if (nextApproverPhone) {
      const newToken = generateToken();
      await supabase.from('leave_requests').update({ approval_token: newToken }).eq('id', params.id);
      const approveUrl = `${process.env.NEXT_PUBLIC_APP_URL}/approve/${newToken}`;

      await notifyLeaveApprover({
        approverPhone: nextApproverPhone.replace(/[^0-9]/g, ''),
        employeeName: `${leave.employee?.first_name} ${leave.employee?.last_name}`,
        leaveType: leave.leave_type,
        dateFrom: leave.date_from,
        dateTo: leave.date_to,
        days: leave.working_days_count ?? 1,
        reason: leave.reason,
        plBalance: 0,
        approveUrl,
      });
    }

    return NextResponse.json({ success: true, status: 'Forwarded to next approver' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
