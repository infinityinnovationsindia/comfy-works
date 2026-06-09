export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Punches within this window are treated as a single punch event
// (covers people who scan 2-4 times to make sure the machine registered)
const CLUSTER_WINDOW_SECONDS = 60

// Fallback rules used when an employee has NO category assigned.
// These match the previous hardcoded behavior — zero regression.
const DEFAULT_RULES = {
  late_grace_minutes: 0,
  early_grace_minutes: 0,
  half_day_if_hours_below: 5,   // legacy: <5 hrs → AA
  absent_if_hours_below: 0,     // disabled
}

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  return handler(url.searchParams.get('date'))
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  return handler(url.searchParams.get('date'))
}

// Group punches that occurred within CLUSTER_WINDOW_SECONDS of each other.
function clusterPunches(times: Date[]): Date[][] {
  if (times.length === 0) return []
  const sorted = [...times].sort((a, b) => a.getTime() - b.getTime())
  const clusters: Date[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1]
    const lastTime = lastCluster[lastCluster.length - 1]
    const gapSec = (sorted[i].getTime() - lastTime.getTime()) / 1000
    if (gapSec <= CLUSTER_WINDOW_SECONDS) {
      lastCluster.push(sorted[i])
    } else {
      clusters.push([sorted[i]])
    }
  }
  return clusters
}

async function handler(dateParam: string | null) {
  try {
    const supabase = createSupabase()

    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const todayIST = istNow.toISOString().split('T')[0]
    const targetDate = dateParam || todayIST
    const isToday = targetDate === todayIST

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 })
    }

    const istStartUTC = new Date(`${targetDate}T00:00:00+05:30`).toISOString()
    const istEndUTC = new Date(`${targetDate}T23:59:59+05:30`).toISOString()

    // Fetch employees + their category_id
    const { data: employees } = await supabase
      .from('employees')
      .select('id, employee_no, location, shift_id, category_id, is_biometric_exempt')
      .eq('status', 'Active')

    if (!employees?.length) {
      return NextResponse.json({ date: targetDate, processed: 0, errors: [] })
    }

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

    // Fetch ALL categories once, build a lookup map
    const { data: categories } = await supabase
      .from('categories')
      .select('id, late_grace_minutes, early_grace_minutes, half_day_if_hours_below, absent_if_hours_below')
    const categoryMap = new Map(categories?.map(c => [c.id, c]) || [])

    const { data: holidays } = await supabase
      .from('holidays')
      .select('calendar_type, date')
      .eq('date', targetDate)

    const factoryHoliday = holidays?.some(h => h.calendar_type === 'Factory')
    const showroomHoliday = holidays?.some(h => h.calendar_type === 'Showroom')

    const { data: approvedLeaves } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type')
      .eq('status', 'Approved')
      .lte('date_from', targetDate)
      .gte('date_to', targetDate)

    const leaveMap = new Map(approvedLeaves?.map(l => [l.employee_id, l.leave_type]) || [])

    const punchMap = new Map<string, Date[]>()
    for (const punch of punches || []) {
      if (!punch.employee_id) continue
      if (!punchMap.has(punch.employee_id)) punchMap.set(punch.employee_id, [])
      punchMap.get(punch.employee_id)!.push(new Date(punch.punched_at))
    }

    let processed = 0
    const statusCounts: Record<string, number> = {}
    const errors: string[] = []

    for (const emp of employees) {
      try {
        const isHoliday = emp.location === 'Showroom' ? showroomHoliday : factoryHoliday
        const approvedLeave = leaveMap.get(emp.id)
        const isExempt = emp.is_biometric_exempt === true
        const empPunches = punchMap.get(emp.id) || []
        const shift = emp.shift_id ? shiftMap.get(emp.shift_id) : null
        const clusters = clusterPunches(empPunches)

        // Resolve category rules with fallback
        const cat = emp.category_id ? categoryMap.get(emp.category_id) : null
        const rules = {
          late_grace_minutes: cat?.late_grace_minutes ?? DEFAULT_RULES.late_grace_minutes,
          early_grace_minutes: cat?.early_grace_minutes ?? DEFAULT_RULES.early_grace_minutes,
          half_day_if_hours_below: Number(cat?.half_day_if_hours_below ?? DEFAULT_RULES.half_day_if_hours_below),
          absent_if_hours_below: Number(cat?.absent_if_hours_below ?? DEFAULT_RULES.absent_if_hours_below),
        }

        const { data: existingRecord } = await supabase
          .from('attendance_daily')
          .select('is_manually_corrected')
          .eq('employee_id', emp.id)
          .eq('date', targetDate)
          .maybeSingle()

        if (existingRecord?.is_manually_corrected) {
          processed++
          continue
        }

        let status: string
        let checkIn: Date | null = null
        let checkOut: Date | null = null
        let hoursWorked = 0
        let redMarksMorning = 0
        let redMarksEvening = 0

        if (isHoliday) {
          if (clusters.length >= 1) checkIn = clusters[0][0]
          if (clusters.length >= 2) {
            const lastCluster = clusters[clusters.length - 1]
            checkOut = lastCluster[lastCluster.length - 1]
            hoursWorked = (checkOut.getTime() - checkIn!.getTime()) / (1000 * 60 * 60)
            status = 'P'
          } else {
            status = 'H'
          }
        } else if (approvedLeave) {
          status = approvedLeave
        } else if (isExempt) {
          status = 'P'
        } else if (clusters.length === 0) {
          status = 'AAA_PENDING'
        } else if (clusters.length === 1) {
          checkIn = clusters[0][0]
          status = isToday ? 'IN_PROGRESS' : 'A'
        } else {
          // 2+ clusters: real check-in and check-out
          checkIn = clusters[0][0]
          const lastCluster = clusters[clusters.length - 1]
          checkOut = lastCluster[lastCluster.length - 1]
          hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)

          // Apply category-based thresholds
          if (rules.absent_if_hours_below > 0 && hoursWorked < rules.absent_if_hours_below) {
            status = 'A'
          } else if (rules.half_day_if_hours_below > 0 && hoursWorked < rules.half_day_if_hours_below) {
            status = 'AA'
          } else {
            status = 'P'
          }

          // Red marks — only meaningful if Present (not AA / A)
          if (shift && status === 'P') {
            const [shiftStartH, shiftStartM] = shift.start_time.split(':').map(Number)
            const [shiftEndH, shiftEndM] = shift.end_time.split(':').map(Number)

            const shiftStart = new Date(
              `${targetDate}T${String(shiftStartH).padStart(2, '0')}:${String(shiftStartM).padStart(2, '0')}:00+05:30`
            )
            const shiftEnd = new Date(
              `${targetDate}T${String(shiftEndH).padStart(2, '0')}:${String(shiftEndM).padStart(2, '0')}:00+05:30`
            )

            // Apply category grace: only minutes past grace count toward red marks
            const rawMinsLate = Math.floor((checkIn.getTime() - shiftStart.getTime()) / 60000)
            const rawMinsEarly = Math.floor((shiftEnd.getTime() - checkOut.getTime()) / 60000)

            const effMinsLate = Math.max(0, rawMinsLate - rules.late_grace_minutes)
            const effMinsEarly = Math.max(0, rawMinsEarly - rules.early_grace_minutes)

            if (effMinsLate > 0 && effMinsLate <= 15) redMarksMorning = 1
            else if (effMinsLate > 15 && effMinsLate <= 30) redMarksMorning = 2
            else if (effMinsLate > 30) redMarksMorning = 3

            if (effMinsEarly > 0 && effMinsEarly <= 15) redMarksEvening = 1
            else if (effMinsEarly > 15 && effMinsEarly <= 30) redMarksEvening = 2
            else if (effMinsEarly > 30) redMarksEvening = 3
          }
        }

        const { error: upsertErr } = await supabase
          .from('attendance_daily')
          .upsert(
            {
              employee_id: emp.id,
              date: targetDate,
              check_in: checkIn?.toISOString() ?? null,
              check_out: checkOut?.toISOString() ?? null,
              hours_worked: Math.round(hoursWorked * 10) / 10,
              status,
              red_marks_morning: redMarksMorning,
              red_marks_evening: redMarksEvening,
              red_marks_total: redMarksMorning + redMarksEvening,
            },
            { onConflict: 'employee_id,date' }
          )

        if (upsertErr) {
          errors.push(`${emp.employee_no}: ${upsertErr.message}`)
        } else {
          processed++
          statusCounts[status] = (statusCounts[status] || 0) + 1
        }
      } catch (e: any) {
        errors.push(`${emp.employee_no}: ${e.message}`)
      }
    }

    return NextResponse.json({
      date: targetDate,
      is_today: isToday,
      processed,
      errors,
      status_breakdown: statusCounts,
      message: `Processed ${processed} employees for ${targetDate}`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
