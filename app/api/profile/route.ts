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
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) { try { cookieStore.set({ name, value, ...options }) } catch {} },
        remove(name: string, options: any) { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
      },
    }
  )
}

export async function GET() {
  const supabase = createSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('employee_id')
    .eq('id', user.id)
    .single()

  if (!account?.employee_id) return NextResponse.json({ error: 'No employee linked' }, { status: 404 })

  const empId = account.employee_id

  const { data: emp } = await supabase
    .from('employees')
    .select('*')
    .eq('id', empId)
    .single()

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Get shift name
  let shiftName = null
  if (emp.shift_id) {
    const { data: shift } = await supabase.from('shifts').select('name').eq('id', emp.shift_id).single()
    shiftName = shift?.name || null
  }

  // Get manager name
  let managerName = null
  if (emp.reporting_manager_id) {
    const { data: mgr } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', emp.reporting_manager_id)
      .single()
    if (mgr) managerName = `${mgr.first_name} ${mgr.last_name}`
  }

  // Current FY leave balance
  const now = new Date()
  const fy  = now.getMonth() >= 3
    ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`

  const { data: lb } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('employee_id', empId)
    .eq('financial_year', fy)
    .single()

  // This month red marks
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-01`
  const lastDay    = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthEnd   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${lastDay}`

  const { data: att } = await supabase
    .from('attendance_daily')
    .select('status, red_marks_total')
    .eq('employee_id', empId)
    .gte('date', monthStart)
    .lte('date', monthEnd)

  const daysPresent = att?.filter((a: any) => a.status === 'P').length || 0
  const daysAbsent  = att?.filter((a: any) => ['A','AAA'].includes(a.status)).length || 0
  const redMarks    = att?.reduce((s: number, a: any) => s + (a.red_marks_total || 0), 0) || 0

  return NextResponse.json({
    id:                     emp.id,
    employee_no:            emp.employee_no,
    first_name:             emp.first_name,
    last_name:              emp.last_name,
    middle_name:            emp.middle_name,
    gender:                 emp.gender,
    date_of_birth:          emp.date_of_birth,
    email:                  emp.email,
    blood_group:            emp.blood_group,
    designation:            emp.designation,
    department:             emp.department,
    location:               emp.location,
    employment_type:        emp.employment_type,
    date_of_joining:        emp.date_of_joining,
    probation_end_date:     emp.probation_end_date,
    shift_name:             shiftName,
    reporting_manager_name: managerName,
    local_phone:            emp.local_phone   || null,
    local_address:          emp.local_address || null,
    pl_earned:              lb?.pl_earned  || 0,
    pl_used:                lb?.pl_used    || 0,
    pl_balance:             lb?.pl_balance || 0,
    days_present:           daysPresent,
    days_absent:            daysAbsent,
    red_marks:              redMarks,
  })
}

export async function PATCH(request: Request) {
  const supabase = createSupabase()
  const body = await request.json()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('employee_id')
    .eq('id', user.id)
    .single()

  if (!account?.employee_id) return NextResponse.json({ error: 'No employee linked' }, { status: 404 })

  const allowed = ['local_phone', 'local_address']
  const update: Record<string, any> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }
  update.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('employees')
    .update(update)
    .eq('id', account.employee_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
