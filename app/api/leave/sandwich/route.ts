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
      return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
    }

    // ── Get employee's calendar type ───────────────────────────────────
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

    // ── Build all dates in range ────────────────────────────────────────
    const allDates: string[] = []
    const cur = new Date(fromDate)
    while (cur <= toDate) {
      allDates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }

    // ── Fetch holidays in range ────────────────────────────────────────
    const { data: holidayRows } = await supabase
      .from('holidays')
      .select('date, name, type')
      .in('date', allDates)
      .eq('calendar_type', calendarType)

    const holidayMap = new Map<string, { name: string; type: string }>()
    for (const h of holidayRows || []) {
      holidayMap.set(h.date, { name: h.name, type: h.type })
    }

    // ── Non-working day check ──────────────────────────────────────────
    // Comfy Furniture: Mon-Sat working, Sunday weekly off
    function isNonWorkingDay(dateStr: string): boolean {
      const d = new Date(dateStr)
      if (d.getDay() === 0) return true       // Sunday = weekly off
      if (holidayMap.has(dateStr)) return true // declared holiday
      return false
    }

    // ── THE CORRECT SANDWICH ALGORITHM ────────────────────────────────
    //
    // Rule: A non-working day is counted as leave ONLY IF there is a
    // working-day leave on BOTH sides of it within the selected range.
    //
    // Exception: If leave is taken only BEFORE or only AFTER a weekly
    // off/holiday, that off/holiday is NOT counted as leave.
    //
    // Implementation:
    // 1. Find the first and last WORKING DAY in the selected range
    // 2. Count all days between those two working days (inclusive)
    //    → Non-working days in between = truly sandwiched → count
    // 3. Non-working days BEFORE the first working day → do NOT count
    // 4. Non-working days AFTER the last working day  → do NOT count

    const workingDaysInRange = allDates.filter(d => !isNonWorkingDay(d))

    if (workingDaysInRange.length === 0) {
      // Edge case: selected range has no working days (e.g. only selected Sundays)
      return NextResponse.json({
        working_days:        0,
        pl_to_deduct:        0,
        holidays_in_range:   [],
        notice_violation:    false,
        is_retroactive:      false,
        calendar_type:       calendarType,
        warning:             'No working days in selected range. Leave cannot be applied for non-working days only.',
      })
    }

    const firstWorkingDay = workingDaysInRange[0]
    const lastWorkingDay  = workingDaysInRange[workingDaysInRange.length - 1]

    // Count only days from first to last working day
    const firstIdx = allDates.indexOf(firstWorkingDay)
    const lastIdx  = allDates.indexOf(lastWorkingDay)
    const countedDates = allDates.slice(firstIdx, lastIdx + 1)

    const totalDaysConsumed = countedDates.length

    // Non-working days that are sandwiched (between first and last working day)
    const sandwichedDays = countedDates
      .filter(d => isNonWorkingDay(d))
      .map(d => {
        const holiday = holidayMap.get(d)
        const dayOfWeek = new Date(d).getDay()
        return {
          date: d,
          name: holiday?.name ?? (dayOfWeek === 0 ? 'Sunday' : 'Holiday'),
          type: holiday?.type ?? 'Weekly Off',
        }
      })

    // Days trimmed from start (leading non-working days — not counted)
    const trimmedStart = allDates.slice(0, firstIdx)
    const trimmedEnd   = allDates.slice(lastIdx + 1)

    // ── PL to deduct = total days consumed (sandwich included) ─────────
    const plToDeduct = ['PL', 'HPL'].includes(leaveType) ? totalDaysConsumed : 0

    // ── Notice period check ────────────────────────────────────────────
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntilLeave = Math.ceil(
      (new Date(firstWorkingDay).getTime() - today.getTime()) / 86400000
    )

    let noticeViolation = false
    if (['PL', 'UL'].includes(leaveType)   && daysUntilLeave < 3)  noticeViolation = true
    if (['HPL', 'HUL'].includes(leaveType) && daysUntilLeave < 1)  noticeViolation = true
    const isRetroactive = daysUntilLeave < 0
    if (isRetroactive) noticeViolation = true

    return NextResponse.json({
      // Total leave days that will be consumed (correctly sandwiched)
      working_days:        totalDaysConsumed,
      // Actual working days (excluding sandwiched non-working days)
      actual_working_days: workingDaysInRange.length,
      // PL balance to deduct (0 for UL/HUL)
      pl_to_deduct:        plToDeduct,
      // Non-working days that ARE sandwiched (show in UI)
      holidays_in_range:   sandwichedDays,
      // Days trimmed from start/end (not counted — useful for debug)
      trimmed_start:       trimmedStart.length,
      trimmed_end:         trimmedEnd.length,
      notice_violation:    noticeViolation,
      is_retroactive:      isRetroactive,
      calendar_type:       calendarType,
    })
  } catch (err: any) {
    console.error('sandwich error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
