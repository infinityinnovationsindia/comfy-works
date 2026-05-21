
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateSandwich, hasNoticeViolation, isRetroactive } from '@/lib/leave-calculator';
import { resolveApprovalChain } from '@/lib/approval-routing';
import { generateToken } from '@/lib/approval-tokens';
import { notifyLeaveApprover } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    employeeId, leaveType, halfDayType,
    dateFrom, dateTo, reason,
    outOfStation, outOfStationContact, outOfStationAddress,
    convertFromPL, // Edge case 1: convert PL→UL if balance=0
  } = body;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Load employee
  const { data: emp } = await supabase
    .from('employees')
    .select('id, first_name, last_name, employee_no, employment_type, location, phone')
    .eq('id', employeeId)
    .single();

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // ── EDGE CASE 2: Probationer applying PL ────────────────────
  if (leaveType === 'PL' && emp.employment_type === 'Probationer') {
    return NextResponse.json({
      error: 'PROBATIONER_PL_BLOCKED',
      message: 'PL cannot be used during probation. Apply for Unpaid Leave (UL) instead.',
      suggestion: 'UL',
    }, { status: 422 });
  }

  // Load current PL balance
  const now = new Date();
  const fy = now.getMonth() >= 3
    ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`;

  const { data: balance } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('financial_year', fy)
    .single();

  const plBalance = balance?.pl_balance ?? 0;

  // Load holidays for sandwich calculation
  const { data: holidays } = await supabase
    .from('holidays')
    .select('date, name, calendar_type')
    .gte('date', dateFrom)
    .lte('date', dateTo);

  const sandwich = calculateSandwich(dateFrom, dateTo, holidays ?? [], emp.location);
  const plToConsume = ['PL', 'HPL'].includes(leaveType)
    ? (leaveType === 'HPL' ? 0.5 : sandwich.plToDeduct)
    : 0;

  // ── EDGE CASE 1: PL balance = 0, employee applies PL ────────
  if (['PL', 'HPL'].includes(leaveType) && plBalance < plToConsume) {
    if (!convertFromPL) {
      return NextResponse.json({
        error: 'INSUFFICIENT_PL',
        message: `PL balance (${plBalance}) is insufficient for ${plToConsume} days. Convert to Unpaid Leave?`,
        plBalance,
        plRequired: plToConsume,
        suggestion: leaveType === 'PL' ? 'UL' : 'HUL',
        salaryDeductionWarning: `This will result in ${plToConsume} day(s) salary deduction.`,
      }, { status: 422 });
    }
    // Employee confirmed conversion to UL — proceed with converted type
  }

  const finalLeaveType = (convertFromPL && ['PL','HPL'].includes(leaveType))
    ? (leaveType === 'PL' ? 'UL' : 'HUL')
    : leaveType;

  // ── EDGE CASE 4: Notice period violation ─────────────────────
  const noticeViolation = hasNoticeViolation(finalLeaveType, dateFrom);

  // ── EDGE CASE 8: Retroactive application ─────────────────────
  const retroactive = isRetroactive(dateFrom);

  // Resolve approval chain
  const chain = await resolveApprovalChain(employeeId);
  if (!chain) return NextResponse.json({ error: 'Could not determine approval chain' }, { status: 500 });

  // Generate one-tap approval token
  const approvalToken = generateToken();

  const approveUrl = `${process.env.NEXT_PUBLIC_APP_URL}/approve/${approvalToken}`;

  // Insert leave request
  const { data: leave, error: insertErr } = await supabase
    .from('leave_requests')
    .insert({
      employee_id:            employeeId,
      leave_type:             finalLeaveType,
      half_day_type:          halfDayType ?? null,
      date_from:              dateFrom,
      date_to:                dateTo,
      working_days_count:     sandwich.workingDays,
      pl_to_deduct:           plToConsume,
      reason,
      out_of_station:         outOfStation ?? false,
      out_of_station_contact: outOfStationContact ?? null,
      out_of_station_address: outOfStationAddress ?? null,
      notice_violation:       noticeViolation,
      is_retroactive:         retroactive,
      status:                 'Pending',
      l1_approver_id:         chain.l1ApproverId,
      l2_approver_id:         chain.l2ApproverId,
      l3_approver_id:         chain.chainType === '3step' ? chain.l3ApproverId : null,
      chain_type:             chain.chainType,
      approval_token:         approvalToken,
    })
    .select()
    .single();

  if (insertErr || !leave) {
    return NextResponse.json({ error: insertErr?.message }, { status: 500 });
  }

  // Load L1 approver phone
  const { data: l1 } = await supabase
    .from('employees')
    .select('first_name, last_name, phone')
    .eq('id', chain.l1ApproverId)
    .single();

  // Send WhatsApp to L1 approver
  if (l1?.phone) {
    await notifyLeaveApprover({
      approverPhone: l1.phone.replace(/[^0-9]/g, ''),
      employeeName: `${emp.first_name} ${emp.last_name}`,
      leaveType: finalLeaveType,
      dateFrom,
      dateTo,
      days: sandwich.totalCalendarDays,
      reason,
      plBalance: plBalance - plToConsume,
      approveUrl,
    });
  }

  return NextResponse.json({
    success: true,
    leaveId: leave.id,
    leaveType: finalLeaveType,
    plToConsume,
    plBalance,
    noticeViolation,
    retroactive,
    sandwich: {
      totalDays: sandwich.totalCalendarDays,
      sandwichedHolidays: sandwich.sandwichedHolidays,
      breakdown: sandwich.breakdown,
    },
  });
}
