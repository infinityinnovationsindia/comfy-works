export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
}

// ── Inter-request sandwich rule ────────────────────────────────────────────
// Called after a leave is approved.
// Checks if any holidays sit between this leave and another approved leave,
// and if so, marks those holidays as leave in attendance_daily.
async function applyInterRequestSandwichRule(
  supabase: any,
  employeeId: string,
  dateFrom: string,
  dateTo: string,
  leaveType: string,
  calendarType: string,
  approvedBy: string
) {
  const addDays = (dateStr: string, n: number) => {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]
  }

  // Fetch holidays in a window around the leave period
  const scanStart = addDays(dateFrom, -14)
  const scanEnd   = addDays(dateTo, 14)

  const scanDates: string[] = []
  const cur = new Date(scanStart)
  const end = new Date(scanEnd)
  while (cur <= end) {
    scanDates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }

  const { data: holidays } = await supabase
    .from('holidays')
    .select('date, name, type')
    .in('date', scanDates)
    .eq('calendar_type', calendarType)

  const holidayMap = new Map<string, { name: string; type: string }>()
  for (const h of holidays || []) holidayMap.set(h.date, { name: h.name, type: h.type })

  const sandwichedDates: string[] = []

  // ── Check LEFT side ────────────────────────────────────────────────────
  // Walk backwards from dateFrom looking for consecutive holidays
  const leftHolidays: string[] = []
  let checkLeft = addDays(dateFrom, -1)
  while (holidayMap.has(checkLeft)) {
    leftHolidays.push(checkLeft)
    checkLeft = addDays(checkLeft, -1)
  }

  if (leftHolidays.length > 0) {
    // Is there an approved leave ending on checkLeft (day before the holiday chain)?
    const { data: adjacentLeft } = await supabase
      .from('leave_requests')
      .select('id, leave_type, date_from, date_to')
      .eq('employee_id', employeeId)
      .eq('status', 'Approved')
      .eq('date_to', checkLeft)
      .maybeSingle()

    if (adjacentLeft) {
      for (const hDate of leftHolidays) sandwichedDates.push(hDate)
    }
  }

  // ── Check RIGHT side ───────────────────────────────────────────────────
  // Walk forwards from dateTo looking for consecutive holidays
  const rightHolidays: string[] = []
  let checkRight = addDays(dateTo, 1)
  while (holidayMap.has(checkRight)) {
    rightHolidays.push(checkRight)
    checkRight = addDays(checkRight, 1)
  }

  if (rightHolidays.length > 0) {
    // Is there an approved leave starting on checkRight (day after the holiday chain)?
    const { data: adjacentRight } = await supabase
      .from('leave_requests')
      .select('id, leave_type, date_from, date_to')
      .eq('employee_id', employeeId)
      .eq('status', 'Approved')
      .eq('date_from', checkRight)
      .maybeSingle()

    if (adjacentRight) {
      for (const hDate of rightHolidays) sandwichedDates.push(hDate)
    }
  }

  if (sandwichedDates.length === 0) return

  // ── Mark sandwiched holidays as leave in attendance_daily ─────────────
  for (const hDate of sandwichedDates) {
    const hInfo = holidayMap.get(hDate)

    await supabase.from('attendance_daily').upsert({
      employee_id:          employeeId,
      date:                 hDate,
      status:               leaveType, // same type as the approved leave
      check_in:             null,
      check_out:            null,
      hours_worked:         0,
      red_marks_morning:    0,
      red_marks_evening:    0,
      red_marks_total:      0,
      is_manually_corrected: true,
      correction_reason:    `Sandwich rule: ${hInfo?.name ?? 'Holiday'} between two approved leaves`,
      corrected_by:         approvedBy,
      corrected_at:         new Date().toISOString(),
    }, { onConflict: 'employee_id,date' })

    await supabase.from('audit_log').insert({
      table_name: 'attendance_daily',
      record_id:  employeeId,
      action:     'SANDWICH_RULE',
      new_values: {
        date:       hDate,
        status:     leaveType,
        holiday:    hInfo?.name,
        applied_by: 'system',
      },
      changed_by: approvedBy,
      reason: `Inter-request sandwich rule: ${hInfo?.name ?? hDate} falls between two approved leaves`,
    })
  }

  // ── Deduct from PL balance if leave type is PL ────────────────────────
  if (['PL', 'HPL'].includes(leaveType)) {
    const plToDeduct = sandwichedDates.length * (['HPL'].includes(leaveType) ? 0.5 : 1)
    const now = new Date()
    const fy = now.getMonth() >= 3
      ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
      : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`

    const { data: bal } = await supabase
      .from('leave_balances')
      .select('id, pl_used')
      .eq('employee_id', employeeId)
      .eq('financial_year', fy)
      .single()

    if (bal) {
      await supabase.from('leave_balances')
        .update({ pl_used: (bal.pl_used ?? 0) + plToDeduct })
        .eq('id', bal.id)
    }
  }

  console.log(`Sandwich rule applied for employee ${employeeId}: ${sandwichedDates.join(', ')} → ${leaveType}`)
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getFY(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${String(year + 1).slice(2)}`
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(from)
  const end = new Date(to)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// ── Main PATCH handler ─────────────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabase()
  const { id } = params
  const body = await request.json()
  const { type, action, comment } = body

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts').select('role, employee_id').eq('id', user.id).single()
  if (!account) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const role  = account.role
  const empId = account.employee_id
  const now   = new Date().toISOString()

  // ── LEAVE ──────────────────────────────────────────────────────────────
  if (type === 'leave') {
    const { data: req } = await supabase
      .from('leave_requests').select('*').eq('id', id).single()
    if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'approve') {
      if (role === 'super_admin') {
        // Kush is final authority.
        // If still 'Pending' (he's also L1) → fill both L1+L2 and go straight to Approved.
        // If already 'L1_Approved' → fill L2 only.
        const updateData: any = {
          status:         'Approved',
          l2_approver_id: empId,
          l2_approved_at: now,
          l2_comment:     comment || null,
        }
        if (req.status === 'Pending') {
          updateData.l1_approver_id = empId
          updateData.l1_approved_at = now
          updateData.l1_comment     = comment || null
        }
        const { error } = await supabase
          .from('leave_requests').update(updateData).eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // Deduct PL balance if applicable
        if (['PL', 'HPL'].includes(req.leave_type) && req.pl_to_deduct) {
          const fy = getFY()
          const { data: bal } = await supabase
            .from('leave_balances')
            .select('id, pl_used')
            .eq('employee_id', req.employee_id)
            .eq('financial_year', fy)
            .single()
          if (bal) {
            await supabase.from('leave_balances')
              .update({ pl_used: (bal.pl_used ?? 0) + req.pl_to_deduct })
              .eq('id', bal.id)
          }
        }

        // Update attendance records for approved leave dates
        const dates = getDatesInRange(req.date_from, req.date_to)
        for (const date of dates) {
          await supabase.from('attendance_daily').upsert({
            employee_id: req.employee_id,
            date,
            status:      req.leave_type,
            leave_id:    id,
          }, { onConflict: 'employee_id,date' })
        }

        // Audit log
        await supabase.from('audit_log').insert({
          table_name: 'leave_requests',
          record_id:  id,
          action:     'UPDATE',
          old_values: { status: req.status },
          new_values: { status: 'Approved' },
          changed_by: empId,
          reason:     comment || 'Final approval',
        })

        // ── INTER-REQUEST SANDWICH RULE ───────────────────────────────
        // Get employee's calendar type
        const { data: emp } = await supabase
          .from('employees').select('location').eq('id', req.employee_id).single()
        const calType = emp?.location === 'Showroom' ? 'Showroom' : 'Factory'

        await applyInterRequestSandwichRule(
          supabase,
          req.employee_id,
          req.date_from,
          req.date_to,
          req.leave_type,
          calType,
          empId
        )

      } else {
        // L1 approval by other managers
        const { error } = await supabase
          .from('leave_requests').update({
            status:         'L1_Approved',
            l1_approver_id: empId,
            l1_approved_at: now,
            l1_comment:     comment || null,
          }).eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }

    } else if (action === 'reject') {
      const { error } = await supabase
        .from('leave_requests').update({
          status:           'Rejected',
          rejected_by:      empId,
          rejected_at:      now,
          rejection_reason: comment || null,
        }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // If employee is already absent on rejected dates → flag AAA
      const today = new Date().toISOString().split('T')[0]
      if (req.date_from <= today) {
        await supabase.from('attendance_daily')
          .update({ status: 'AAA' })
          .eq('employee_id', req.employee_id)
          .in('date', getDatesInRange(req.date_from, req.date_to))
          .in('status', ['AAA_PENDING', 'A'])
      }

      await supabase.from('audit_log').insert({
        table_name: 'leave_requests',
        record_id:  id,
        action:     'UPDATE',
        old_values: { status: req.status },
        new_values: { status: 'Rejected' },
        changed_by: empId,
        reason:     comment || 'Rejected',
      })
    }
  }

  // ── TIME OFF ───────────────────────────────────────────────────────────
  if (type === 'timeoff') {
    const update = action === 'approve'
      ? { status: 'Approved', approved_by: empId, approved_at: now }
      : { status: 'Rejected' }
    const { error } = await supabase
      .from('time_off_permissions').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── ON DUTY ────────────────────────────────────────────────────────────
  if (type === 'onduty') {
    const update = action === 'approve'
      ? { status: 'Approved', approved_by: empId, approved_at: now }
      : { status: 'Rejected' }
    const { error } = await supabase
      .from('on_duty_requests').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
