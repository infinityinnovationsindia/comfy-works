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
      return NextResponse.json({ error: 'from and to dates required' }, { status: 400 })
    }

    // ── Validate dates ─────────────────────────────────────────────────
    const fromDate = new Date(from)
    const toDate   = new Date(to)
    if (fromDate > toDate) {
      return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
    }

    // ── Get all dates in range (sandwich rule: ALL days count) ────────
    const allDates: string[] = []
    const cur = new Date(from)
    while (cur <= toDate) {
      allDates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
    const workingDays = allDates.length

    // ── Determine employee's calendar type ────────────────────────────
    let calendarType = 'Factory' // default
    if (employeeId) {
      const { data: emp } = await supabase
        .from('employees')
        .select('location')
        .eq('id', employeeId)
        .single()
      if (emp?.location === 'Showroom') calendarType = 'Showroom'
    } else {
      // Get from session
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: account } = await supabase
          .from('user_accounts').select('employee_id').eq('id', user.id).single()
        if (account?.employee_id) {
          const { data: emp } = await supabase
            .from('employees').select('location').eq('id', account.employee_id).single()
          if (emp?.location === 'Showroom') calendarType = 'Showroom'
        }
      }
    }

    // ── Get holidays in the date range ────────────────────────────────
    const { data: holidays } = await supabase
      .from('holidays')
      .select('date, name, type')
      .in('date', allDates)
      .eq('calendar_type', calendarType)

    // ── PL to deduct (sandwich rule: ALL days in range, including holidays) ─
    // Per spec: holidays within leave period count as leave days consumed
    const plToDeduct = ['PL', 'HPL'].includes(leaveType) ? workingDays : 0

    // ── Notice period check ───────────────────────────────────────────
    const today          = new Date()
    today.setHours(0, 0, 0, 0)
    const leaveStart     = new Date(from)
    const daysUntilLeave = Math.ceil((leaveStart.getTime() - today.getTime()) / 86400000)

    let noticeViolation = false
    if (['PL', 'UL'].includes(leaveType) && daysUntilLeave < 3)  noticeViolation = true
    if (['HPL', 'HUL'].includes(leaveType) && daysUntilLeave < 1) noticeViolation = true
    if (daysUntilLeave < 0) noticeViolation = true // retroactive

    return NextResponse.json({
      working_days:       workingDays,      // total days in range (sandwich rule)
      pl_to_deduct:       plToDeduct,       // PL that will be deducted
      holidays_in_range:  (holidays || []).map(h => ({ date: h.date, name: h.name, type: h.type })),
      notice_violation:   noticeViolation,
      is_retroactive:     daysUntilLeave < 0,
      calendar_type:      calendarType,
    })
  } catch (err: any) {
    console.error('sandwich error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
