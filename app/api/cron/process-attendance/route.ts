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

// Handles POST (manual from Settings) and GET (Vercel cron)
export async function POST() { return handler() }
export async function GET()  { return handler() }

async function handler() {
  try {
    const supabase = createSupabase()

    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const today  = istNow.toISOString().split('T')[0]

    // Get all active employees with shift + biometric exempt flag
    const { data: employees } = await supabase
      .from('employees')
      .select('id, employee_no, location, shift_id, is_biometric_exempt')
      .eq('status', 'Active')

    if (!employees?.length) {
      return NextResponse.json({ date: today, processed: 0, errors: [] })
    }

    // Get all punches for today
    const { data: punches } = await supabase
      .from('attendance_punches')
      .select('employee_id, punched_at')
      .gte('punched_at', `${today}T00:00:00+00:00`)
      .lte('punched_at', `${today}T23:59:59+00:00`)
      .order('punched_at', { ascending: true })

    // Get all shifts for timing comparison
    const { data: shifts } = await supabase
      .from('shifts')
      .select('id, start_time, end_time')

    const shiftMap = new Map(shifts?.map(s => [s.id, s]) || [])

    // Get holidays for today (both calendars)
    const { data: holidays } = await supabase
      .from('holidays')
      .select('calendar_type, date')
      .eq('date', today)

    const factoryHoliday  = holidays?.some(h => h.calendar_type === 'Factory')
    const showroomHoliday = holidays?.some(h => h.calendar_type === 'Showroom')

    // Get existing approved leaves for today
    const { data: approvedLeaves } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type')
      .eq('status', 'Approved')
      .lte('date_from', today)
      .gte('date_to', today)

    const leaveMap = new Map(approvedLeaves?.map(l => [l.employee_id, l.leave_type]) || [])

    // Group punches by employee
    const punchMap = new Map<string, Date[]>()
    for (const punch of punches || []) {
      if (!punchMap.has(punch.employee_id)) punchMap.set(punch.employee_id, [])
      punchMap.get(punch.employee_id)!.push(new Date(punch.punched_at))
    }

    let processed = 0
    const errors: string[] = []

    for (const emp of employees) {
      try {
        // Check if it's a holiday for this employee's location
        const isHoliday = emp.location === 'Showroom' ? showroomHoliday : factoryHoliday

        // Check approved leave
        const approvedLeave = leaveMap.get(emp.id)

        // Check biometric exempt (partners/management who don't punch)
        const isExempt = emp.is_biometric_exempt === true

        const empPunches = punchMap.get(emp.id) || []
        const shift      = emp.shift_id ? shiftMap.get(emp.shift_id) : null

        let status: string
        let checkIn:  Date | null = null
        let checkOut: Date | null = null
        let hoursWorked = 0
        let redMarksMorning = 0
        let redMarksEvening = 0

        if (isHoliday) {
          // Holiday — mark H (unless punched, then mark P)
          status = empPunches.length >= 2 ? 'P' : 'H'
        } else if (approvedLeave) {
          // Approved leave
          status = approvedLeave
        } else if (isExempt) {
          // ── BIOMETRIC EXEMPT (partners/management) ──────────────────
          // Auto-mark as Present — they don't use biometric
          status    = 'P'
          checkIn   = null  // no punch data
          checkOut  = null
          hoursWorked = 0
        } else if (empPunches.length === 0) {
          // No punches, no approval — pending supervisor confirmation
          status = 'AAA_PENDING'
        } else if (empPunches.length === 1) {
          // Single punch — absent (couldn't determine in/out)
          status  = 'A'
          checkIn = empPunches[0]
        } else {
          // 2+ punches — calculate hours
          checkIn   = empPunches[0]
          checkOut  = empPunches[empPunches.length - 1]
          hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)

          if (hoursWorked < 5) {
            status = 'AA' // Less than 5 hours, no approval
          } else {
            status = 'P'
          }

          // Red marks calculation (only for non-exempt employees)
          if (shift && status === 'P') {
            const [shiftStartH, shiftStartM] = shift.start_time.split(':').map(Number)
            const [shiftEndH,   shiftEndM]   = shift.end_time.split(':').map(Number)

            const shiftStartIST = new Date(checkIn)
            shiftStartIST.setHours(shiftStartH, shiftStartM, 0, 0)

            const shiftEndIST = new Date(checkOut)
            shiftEndIST.setHours(shiftEndH, shiftEndM, 0, 0)

            // Morning late
            const minsLate = Math.floor((checkIn.getTime() - shiftStartIST.getTime()) / 60000)
            if (minsLate > 0 && minsLate <= 15)  redMarksMorning = 1
            else if (minsLate > 15 && minsLate <= 30) redMarksMorning = 2
            else if (minsLate > 30) redMarksMorning = 3

            // Evening early leaving
            const minsEarly = Math.floor((shiftEndIST.getTime() - checkOut.getTime()) / 60000)
            if (minsEarly > 0 && minsEarly <= 15)  redMarksEvening = 1
            else if (minsEarly > 15 && minsEarly <= 30) redMarksEvening = 2
            else if (minsEarly > 30) redMarksEvening = 3
          }
        }

        const redMarksTotal = redMarksMorning + redMarksEvening

        // Upsert attendance_daily
        const { error: upsertErr } = await supabase
          .from('attendance_daily')
          .upsert({
            employee_id:        emp.id,
            date:               today,
            check_in:           checkIn?.toISOString()  ?? null,
            check_out:          checkOut?.toISOString() ?? null,
            hours_worked:       Math.round(hoursWorked * 10) / 10,
            status,
            red_marks_morning:  redMarksMorning,
            red_marks_evening:  redMarksEvening,
            red_marks_total:    redMarksTotal,
          }, { onConflict: 'employee_id,date' })

        if (upsertErr) {
          errors.push(`${emp.employee_no}: ${upsertErr.message}`)
        } else {
          processed++
        }
      } catch (e: any) {
        errors.push(`${emp.employee_no}: ${e.message}`)
      }
    }

    return NextResponse.json({
      date: today,
      processed,
      errors,
      message: `Processed ${processed} employees for ${today}`,
    })
  } catch (err: any) {
    console.error('process-attendance error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
