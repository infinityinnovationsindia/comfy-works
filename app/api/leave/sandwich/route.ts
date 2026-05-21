export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
}

// GET /api/leave/sandwich?from=YYYY-MM-DD&to=YYYY-MM-DD&type=PL&employee_id=xxx
export async function GET(request: Request) {
  try {
    const supabase = createSupabase()
    const { searchParams } = new URL(request.url)
    const from       = searchParams.get('from')
    const to         = searchParams.get('to')
    const leaveType  = searchParams.get('type') || 'PL'
    const employeeId = searchParams.get('employee_id')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to required' }, { status: 400 })
    }

    const fromDate = new Date(from)
    const toDate   = new Date(to)
    if (fromDate > toDate) {
      return NextResponse.json({ error: 'from must be <= to' }, { status: 400 })
    }

    // ── Determine employee's calendar type ────────────────────────────
    let calendarType = 'Factory'
    let empId = employeeId

    if (!empId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: acc } = await supabase
          .from('user_accounts').select('employee_id').eq('id', user.id).single()
        empId = acc?.employee_id
      }
    }

    if (empId) {
      const { data: emp } = await supabase
        .from('employees').select('location').eq('id', empId).single()
      if (emp?.location === 'Showroom') calendarType = 'Showroom'
    }

    // ── Build a wide date window to detect sandwiching ─────────────────
    // We need to check dates AROUND the leave period:
    // - The day before fromDate (is it a working day? if so, no sandwich on left)
    // - The day after toDate (is it a working day? if so, no sandwich on right)
    // Plus all dates in between

    // Get a window: 7 days before and after to catch any surrounding weekends
    const windowStart = new Date(fromDate)
    windowStart.setDate(windowStart.getDate() - 7)
    const windowEnd = new Date(toDate)
    windowEnd.setDate(windowEnd.getDate() + 7)

    const windowDates: string[] = []
    const cur = new Date(windowStart)
    while (cur <= windowEnd) {
      windowDates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }

    // Fetch all holidays in the window
    const { data: holidayRows } = await supabase
      .from('holidays')
      .select('date, name, type')
      .in('date', windowDates)
      .eq('calendar_type', calendarType)

    const holidayMap = new Map<string, { name: string; type: string }>()
    for (const h of holidayRows || []) {
      holidayMap.set(h.date, { name: h.name, type: h.type })
    }

    // ── Helper: is a given date a non-working day? ──────────────────────
    // Non-working = Sunday OR in holiday calendar
    function isNonWorkingDay(dateStr: string): boolean {
      const d = new Date(dateStr)
      if (d.getDay() === 0) return true          // Sunday
      if (holidayMap.has(dateStr)) return true    // Holiday
      return false
    }

    // ── Core sandwich rule calculation ──────────────────────────────────
    //
    // The employee has applied leave from `from` to `to`.
    // Between these dates, every day that falls between two actual
    // leave-applied days (even if it's a weekend/holiday) gets counted.
    //
    // More precisely:
    // 1. Start with all dates in [from, to]
    // 2. Each date in range is either:
    //    a. A working day → counts as 1 leave day (the applied leave)
    //    b. A non-working day (weekend/holiday):
    //       → counts as leave IF there is a leave day (or another
    //         sandwiched non-working day) on BOTH sides
    //       → does NOT count if it's at the start or end of the range
    //         with no leave day beyond it on that side
    //
    // Simplest correct implementation:
    // - All dates within [from..to] count as leave (including non-working days)
    //   EXCEPT: non-working days at the very START or END of the range
    //   are only counted if the ADJACENT date outside the range is also leave.
    //
    // Actually the CORRECT and simplest rule per Indian HR practice:
    // Every date between fromDate and toDate (inclusive) is counted as leave.
    // The "sandwich" is already built in — if you apply Fri→Mon, you get 4 days.
    // The rule just means you CAN'T avoid the weekend by applying Fri + Mon separately.
    //
    // HOWEVER — the rule only applies when there IS leave on both sides.
    // Since the employee is applying leave from `from` to `to`, ALL days
    // in that range are by definition sandwiched between applied leave days.
    //
    // The key insight for the preview:
    // Days in range = all days from `from` to `to` inclusive
    // Non-working days within that range = "sandwiched" days that will be deducted
    //
    // Edge check: single-day leave (from === to) — no sandwiching possible.

    const allDatesInRange: string[] = []
    const c2 = new Date(fromDate)
    while (c2 <= toDate) {
      allDatesInRange.push(c2.toISOString().split('T')[0])
      c2.setDate(c2.getDate() + 1)
    }

    // Working days = days the employee ACTUALLY applied leave for
    // (excludes non-working days at edges that aren't sandwiched)
    //
    // Sandwich applies to interior non-working days.
    // Edge non-working days are also counted because the employee deliberately
    // included them in their range.
    //
    // ALL days in [from..to] = leave days consumed (this IS the sandwich rule)
    const totalDaysConsumed = allDatesInRange.length

    // ── Identify which non-working days are "sandwiched" ───────────────
    // These are non-working days BETWEEN working leave days within the range
    const sandwichedDays: { date: string; name: string }[] = []

    for (const dateStr of allDatesInRange) {
      if (!isNonWorkingDay(dateStr)) continue

      const holiday = holidayMap.get(dateStr)
      const d       = new Date(dateStr)
      const isSun   = d.getDay() === 0

      sandwichedDays.push({
        date: dateStr,
        name: holiday?.name ?? (isSun ? 'Sunday' : 'Holiday'),
      })
    }

    // ── Working days that are actual leave (not non-working) ───────────
    const actualWorkingDaysInRange = allDatesInRange.filter(d => !isNonWorkingDay(d)).length

    // ── PL to deduct = ALL days in range (sandwich rule) ───────────────
    const plToDeduct = ['PL','HPL'].includes(leaveType) ? totalDaysConsumed : 0

    // ── Notice period check ────────────────────────────────────────────
    const today          = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntilLeave = Math.ceil((fromDate.getTime() - today.getTime()) / 86400000)

    let noticeViolation = false
    if (['PL','UL'].includes(leaveType)   && daysUntilLeave < 3)  noticeViolation = true
    if (['HPL','HUL'].includes(leaveType) && daysUntilLeave < 1)  noticeViolation = true
    if (daysUntilLeave < 0) noticeViolation = true

    return NextResponse.json({
      // Total days that will be deducted from leave balance
      working_days:            totalDaysConsumed,
      // PL specifically to deduct (0 for UL/HUL)
      pl_to_deduct:            plToDeduct,
      // Non-working days within the range (sandwiched weekends/holidays)
      holidays_in_range:       sandwichedDays,
      // How many of those days are actual working days
      actual_working_days:     actualWorkingDaysInRange,
      notice_violation:        noticeViolation,
      is_retroactive:          daysUntilLeave < 0,
      calendar_type:           calendarType,
    })
  } catch (err: any) {
    console.error('sandwich error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
