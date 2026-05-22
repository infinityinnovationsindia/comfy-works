export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST() { return handler() }
export async function GET()  { return handler() }

async function handler() {
  try {
    const supabase = createSupabase()

    // IST today
    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const today  = istNow.toISOString().split('T')[0]

    // IST day boundaries in UTC
    // IST = UTC+5:30, so IST 00:00 = UTC prev day 18:30
    const istStartUTC = new Date(`${today}T00:00:00+05:30`).toISOString()
    const istEndUTC   = new Date(`${today}T23:59:59+05:30`).toISOString()

    const { data: employees } = await supabase
      .from('employees')
      .select('id, employee_no, location, shift_id, is_biometric_exempt')
      .eq('status', 'Active')

    if (!employees?.length) {
      return NextResponse.json({ date: today, processed: 0, errors: [] })
    }

    // Get punches using IST day boundaries
    const { data: punches } = await supabase
      .from('attendance_punches')
      .select('employee_id, punched_at')
      .gte('punched_at', istStartUTC)
      .lte('punched_at', istEndUTC)
      .order('punched_at', { ascending: true })

    const { data: shifts } = await supabase
      .from('shifts')
      .select('id, start_time, end_time')

    const shiftMap = new Map(shifts?.map(s => [s.id, s]) || [])

    const { data: holidays } = await supabase
      .from('holidays')
      .select('calendar_type, date')
      .eq('date', today)

    const factoryHoliday  = holidays?.some(h => h.calendar_type === 'Factory')
    const showroomHoliday = holidays?.some(h => h.calendar_type === 'Showroom')

    const { data: approvedLeaves } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type')
      .eq('status', 'Approved')
      .lte('date_from', today)
      .gte('date_to', today)

    const leaveMap = new Map(approvedLeaves?.map(l => [l.employee_id, l.leave_type]) || [])

    const punchMap = new Map<string, Date[]>()
    for (const punch of punches || []) {
      if (!punch.employee_id) continue
      if (!punchMap.has(punch.employee_id)) punchMap.set(punch.employee_id, [])
      punchMap.get(punch.employee_id)!.push(new Date(punch.punched_at))
    }

    let processed = 0
    const errors: string[] = []

    for (const emp of employees) {
      try {
        const isHoliday    = emp.location === 'Showroom' ? showroomHoliday : factoryHoliday
        const approvedLeave = leaveMap.get(emp.id)
        const isExempt     = emp.is_biometric_exempt === true
        const empPunches   = punchMap.get(emp.id) || []
        const shift        = emp.shift_id ? shiftMap.get(emp.shift_id) : null

        const { data: existingRecord } = await supabase
          .from('attendance_daily')
          .select('is_manually_corrected')
          .eq('employee_id', emp.id)
          .eq('date', today)
          .maybeSingle()

        if (existingRecord?.is_manually_corrected) {
          processed++
          continue
        }

        let status: string
        let checkIn:  Date | null = null
        let checkOut: Date | null = null
        let hoursWorked = 0
        let redMarksMorning = 0
        let redMarksEvening = 0

        if (isHoliday) {
          status = empPunches.length >= 2 ? 'P' : 'H'
        } else if (approvedLeave) {
          status = approvedLeave
        } else if (isExempt) {
          status = 'P'
        } else if (empPunches.length === 0) {
          status = 'AAA_PENDING'
        } else if (empPunches.length === 1) {
          status  = 'A'
          checkIn = empPunches[0]
        } else {
          checkIn     = empPunches[0]
          checkOut    = empPunches[empPunches.length - 1]
          hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)
          status      = hoursWorked < 5 ? 'AA' : 'P'

          if (shift && status === 'P') {
            const [shiftStartH, shiftStartM] = shift.start_time.split(':').map(Number)
            const [shiftEndH,   shiftEndM]   = shift.end_time.split(':').map(Number)

            // Compare in IST
            const istDate = today
            const shiftStart = new Date(`${istDate}T${String(shiftStartH).padStart(2,'0')}:${String(shiftStartM).padStart(2,'0')}:00+05:30`)
            const shiftEnd   = new Date(`${istDate}T${String(shiftEndH).padStart(2,'0')}:${String(shiftEndM).padStart(2,'0')}:00+05:30`)

            const minsLate  = Math.floor((checkIn.getTime()  - shiftStart.getTime()) / 60000)
            const minsEarly = Math.floor((shiftEnd.getTime() - checkOut.getTime())   / 60000)

            if (minsLate > 0  && minsLate  <= 15) redMarksMorning = 1
            else if (minsLate  > 15 && minsLate  <= 30) redMarksMorning = 2
            else if (minsLate  > 30) redMarksMorning = 3

            if (minsEarly > 0 && minsEarly <= 15) redMarksEvening = 1
            else if (minsEarly > 15 && minsEarly <= 30) redMarksEvening = 2
            else if (minsEarly > 30) redMarksEvening = 3
          }
        }

        const { error: upsertErr } = await supabase
          .from('attendance_daily')
          .upsert({
            employee_id:       emp.id,
            date:              today,
            check_in:          checkIn?.toISOString()  ?? null,
            check_out:         checkOut?.toISOString() ?? null,
            hours_worked:      Math.round(hoursWorked * 10) / 10,
            status,
            red_marks_morning: redMarksMorning,
            red_marks_evening: redMarksEvening,
            red_marks_total:   redMarksMorning + redMarksEvening,
          }, { onConflict: 'employee_id,date' })

        if (upsertErr) errors.push(`${emp.employee_no}: ${upsertErr.message}`)
        else processed++

      } catch (e: any) {
        errors.push(`${emp.employee_no}: ${e.message}`)
      }
    }

    return NextResponse.json({ date: today, processed, errors, message: `Processed ${processed} employees for ${today}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
