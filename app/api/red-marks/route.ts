import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams } = new URL(request.url)
  const year  = parseInt(searchParams.get('year')  || String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Date range for the month
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`
  const endDay    = new Date(year, month, 0).getDate()
  const endDate   = `${year}-${String(month).padStart(2,'0')}-${endDay}`

  // Get all active employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employee_no, first_name, last_name, department, designation, daily_salary_rate')
    .eq('status', 'Active')
    .order('employee_no')

  if (!employees) return NextResponse.json({ employees: [] })

  // Get all daily attendance with red marks for the month
  const { data: attendance } = await supabase
    .from('attendance_daily')
    .select('employee_id, date, red_marks_morning, red_marks_evening, red_marks_total')
    .gte('date', startDate)
    .lte('date', endDate)
    .gt('red_marks_total', 0)

  // Group by employee
  const attMap = new Map<string, { morning: number; evening: number; total: number; details: any[] }>()

  for (const a of attendance || []) {
    if (!attMap.has(a.employee_id)) {
      attMap.set(a.employee_id, { morning: 0, evening: 0, total: 0, details: [] })
    }
    const entry = attMap.get(a.employee_id)!
    entry.morning += a.red_marks_morning || 0
    entry.evening += a.red_marks_evening || 0
    entry.total   += a.red_marks_total   || 0
    entry.details.push({
      date:    a.date,
      morning: a.red_marks_morning || 0,
      evening: a.red_marks_evening || 0,
      total:   a.red_marks_total   || 0,
    })
  }

  const result = employees.map(emp => {
    const rm = attMap.get(emp.id)
    return {
      employee_id:       emp.id,
      employee_no:       emp.employee_no,
      first_name:        emp.first_name,
      last_name:         emp.last_name,
      department:        emp.department || '—',
      designation:       emp.designation || '—',
      daily_salary_rate: emp.daily_salary_rate || 0,
      morning_marks:     rm?.morning || 0,
      evening_marks:     rm?.evening || 0,
      total_marks:       rm?.total   || 0,
      details:           rm?.details.sort((a, b) => a.date.localeCompare(b.date)) || [],
    }
  })

  // Sort: most red marks first, then zero marks alphabetically
  result.sort((a, b) => {
    if (b.total_marks !== a.total_marks) return b.total_marks - a.total_marks
    return a.last_name.localeCompare(b.last_name)
  })

  return NextResponse.json({ employees: result, year, month })
}
