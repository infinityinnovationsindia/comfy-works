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

    // ── Fetch ONLY the holiday calendar — no auto-Sunday assumption ─────
    // A date is non-working ONLY if it appears in the holiday calendar.
    // Some Sundays ARE working days at Comfy Factory (if not listed).
    // Some Sundays ARE holidays (if listed in calendar).
    // This respects the actual calendar exactly.
    const { data: holidayRows } = await supabase
      .from('holidays')
      .select('date, name, type')
      .in('date', allDates)
      .eq('calendar_type', calendarType)

    const holidayMap = new Map<string, { name: string; type: string }>()
    for (const h of holidayRows || []) {
      holidayMap.set(h.date, { name: h.name, type: h.type })
    }

    // ── Non-working = in holiday calendar ONLY ─────────────────────────
    function isNonWorkingDay(dateStr: string): boolean {
      return holidayMap.has(dateStr)
    }

    // ── Correct sandwich algorithm ─────────────────────────────────────
    //
    // 1. Find first and last WORKING day in selected range
    // 2. Count all days between them (inclusive) — sandwiched holidays included
    // 3. Non-working days BEFORE first working day → trimmed, not counted
    // 4. Non-working days AFTER last working day  → trimmed, not counted
    //
    // Exception rule: "If leave is taken only before OR only after a
    // weekly off/holiday, that off/holiday is NOT counted as leave."
    // This is automatically handled by trimming leading/trailing non-working days.

    const workingDaysInRange = allDates.filter(d => !isNonWorkingDay(d))

    if (workingDaysInRange.length === 0) {
      // All selected dates are holidays/non-working — cannot apply leave
      const holidayNames = allDates
        .filter(d => holidayMap.has(d))
        .map(d => holidayMap.get(d)!.name)
        .filter((v, i, a) => a.indexOf(v) === i) // unique names

      return NextResponse.json({
        working_days:      0,
        pl_to_deduct:      0,
        holidays_in_range: [],
        notice_violation:  false,
        is_retroactive:    false,
        calendar_type:     calendarType,
        blocked:           true,
        block_reason:      holidayNames.length > 0
          ? `Selected date(s) are holidays (${holidayNames.join(', ')}). Leave cannot be applied on holidays.`
          : 'No working days in selected range.',
      })
    }

    const firstWorkingDay = workingDaysInRange[0]
    const lastWorkingDay  = workingDaysInRange[workingDaysInRange.length - 1]

    const firstIdx    = allDates.indexOf(firstWorkingDay)
    const lastIdx     = allDates.indexOf(lastWorkingDay)
    const countedDates = allDates.slice(firstIdx, lastIdx + 1)

    const totalDaysConsumed = countedDates.length

    // Sandwiched = non-working days between first and last working day
    // These are truly sandwiched — there's working leave on both sides
    const sandwichedDays = countedDates
      .filter(d => isNonWorkingDay(d))
      .map(d => ({
        date: d,
        name: holidayMap.get(d)!.name,
        type: holidayMap.get(d)!.type,
      }))

    const plToDeduct = ['PL', 'HPL'].includes(leaveType) ? totalDaysConsumed : 0

    // Notice period check
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
      working_days:        totalDaysConsumed,
      actual_working_days: workingDaysInRange.length,
      pl_to_deduct:        plToDeduct,
      holidays_in_range:   sandwichedDays,
      blocked:             false,
      block_reason:        null,
      notice_violation:    noticeViolation,
      is_retroactive:      isRetroactive,
      calendar_type:       calendarType,
    })
  } catch (err: any) {
    console.error('sandwich error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
