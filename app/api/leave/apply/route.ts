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

function getFY() {
  const now = new Date()
  return now.getMonth() >= 3
    ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from), end = new Date(to)
  while (cur <= end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
  return dates
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: account } = await supabase
      .from('user_accounts').select('role, employee_id').eq('id', user.id).single()
    if (!account) return NextResponse.json({ error: 'No account' }, { status: 403 })

    const body = await request.json()
    const {
      leave_type, half_day_type, date_from, date_to, reason,
      out_of_station, out_of_station_contact, out_of_station_address,
      on_behalf_employee_id, // admin filling for another employee
    } = body

    // Determine the employee this leave is FOR
    const adminRoles = ['super_admin', 'hr_assistant', 'supervisor', 'production_head', 'design_head', 'project_head']
    const isAdmin = adminRoles.includes(account.role)
    const targetEmpId = (on_behalf_employee_id && isAdmin) ? on_behalf_employee_id : account.employee_id
    const filedOnBehalf = !!(on_behalf_employee_id && isAdmin && on_behalf_employee_id !== account.employee_id)

    if (!targetEmpId) return NextResponse.json({ error: 'No employee linked to account' }, { status: 400 })
    if (!leave_type || !date_from || !date_to || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get employee info for approval routing
    const { data: emp } = await supabase
      .from('employees').select('employment_type, reporting_manager_id, location, department')
      .eq('id', targetEmpId).single()

    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    // Probationer PL block
    if (['PL','HPL'].includes(leave_type) && emp.employment_type !== 'Permanent') {
      return NextResponse.json({ error: 'PL cannot be used during probation period. Please select Unpaid Leave (UL).' }, { status: 400 })
    }

    // Calculate working days (simplified - sandwich rule applied on client side preview)
    const allDates = getDatesInRange(date_from, date_to)

    // Get holidays in range to apply sandwich rule
    const { data: holidays } = await supabase
      .from('holidays')
      .select('date')
      .in('date', allDates)
      .eq('calendar_type', ['Showroom'].includes(emp.location) ? 'Showroom' : 'Factory')

    const holidaySet = new Set((holidays || []).map(h => h.date))
    // Per sandwich rule: ALL days in range count (including holidays/weekends between)
    const workingDays = allDates.length
    const plToDeduct = ['PL','HPL'].includes(leave_type) ? workingDays : 0

    // PL balance check
    if (['PL','HPL'].includes(leave_type)) {
      const { data: lb } = await supabase
        .from('leave_balances').select('pl_balance')
        .eq('employee_id', targetEmpId).eq('financial_year', getFY()).single()
      if ((lb?.pl_balance ?? 0) < plToDeduct) {
        return NextResponse.json({
          error: `Insufficient PL balance. Available: ${lb?.pl_balance ?? 0}, Required: ${plToDeduct}. Please select Unpaid Leave.`
        }, { status: 400 })
      }
    }

    // Notice period check
    const today = new Date().toISOString().split('T')[0]
    const daysBeforeLeave = Math.ceil((new Date(date_from).getTime() - new Date(today).getTime()) / 86400000)
    const noticeViolation = (['PL','UL'].includes(leave_type) && daysBeforeLeave < 3) ||
                            (['HPL','HUL'].includes(leave_type) && daysBeforeLeave < 1) ||
                            (date_from < today) // retroactive

    const isRetroactive = date_from < today

    // Determine L1 approver from reporting_manager_id
    let l1ApproverId = emp.reporting_manager_id

    // Get L2 (Kush - super_admin) id
    const { data: kushAccount } = await supabase
      .from('user_accounts').select('employee_id').eq('role', 'super_admin').single()

    const { data: leaveReq, error } = await supabase
      .from('leave_requests')
      .insert({
        employee_id:              targetEmpId,
        leave_type,
        half_day_type:            half_day_type || null,
        date_from,
        date_to,
        working_days_count:       workingDays,
        pl_to_deduct:             plToDeduct,
        reason,
        out_of_station:           out_of_station ?? false,
        out_of_station_contact:   out_of_station_contact || null,
        out_of_station_address:   out_of_station_address || null,
        notice_violation:         noticeViolation,
        is_retroactive:           isRetroactive,
        status:                   'Pending',
        l1_approver_id:           l1ApproverId || kushAccount?.employee_id,
        l2_approver_id:           kushAccount?.employee_id,
        filed_by_employee_id:     filedOnBehalf ? account.employee_id : null,
        filed_on_behalf:          filedOnBehalf,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Leave insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit log
    await supabase.from('audit_log').insert({
      table_name: 'leave_requests',
      record_id:  leaveReq.id,
      action:     'INSERT',
      new_values: { employee_id: targetEmpId, leave_type, date_from, date_to, filed_on_behalf: filedOnBehalf },
      changed_by: account.employee_id,
      reason:     filedOnBehalf ? `Filed on behalf by ${account.role}` : 'Self application',
    })

    return NextResponse.json({ success: true, id: leaveReq.id })
  } catch (err: any) {
    console.error('leave/apply error:', err)
    return NextResponse.json({ error: err.message || 'Failed to submit' }, { status: 500 })
  }
}
