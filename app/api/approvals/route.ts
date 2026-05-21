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

export async function GET(request: Request) {
  const supabase = createSupabase()
  const { searchParams } = new URL(request.url)
  const countOnly = searchParams.get('count') === '1'

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, employee_id')
    .eq('id', user.id)
    .single()

  if (!account) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const role = account.role
  const empId = account.employee_id

  // ── Leave Requests ────────────────────────────────────────
  let leaveQ = supabase
    .from('leave_requests')
    .select(`
      id, leave_type, half_day_type, date_from, date_to,
      working_days_count, pl_to_deduct, reason,
      notice_violation, is_retroactive, created_at, status,
      employee:employees!leave_requests_employee_id_fkey(
        id, first_name, last_name, employee_no, department, designation, location
      )
    `)
    .order('created_at', { ascending: false })

  if (role === 'super_admin') {
    leaveQ = leaveQ.eq('status', 'L1_Approved')
  } else {
    leaveQ = leaveQ.eq('status', 'Pending').eq('l1_approver_id', empId)
  }

  // ── Time Off Permissions ──────────────────────────────────
  let timeoffQ = supabase
    .from('time_off_permissions')
    .select(`
      id, date, time_out, time_in_expected, purpose, created_at, status,
      employee:employees!time_off_permissions_employee_id_fkey(
        id, first_name, last_name, employee_no, department, designation
      )
    `)
    .eq('status', 'Pending')
    .order('created_at', { ascending: false })

  // ── On Duty Requests ──────────────────────────────────────
  let ondutyQ = supabase
    .from('on_duty_requests')
    .select(`
      id, date, time_out, time_in_planned, purpose,
      location_to_visit, vehicle_type, vehicle_number, created_at, status,
      employee:employees!on_duty_requests_employee_id_fkey(
        id, first_name, last_name, employee_no, department, designation
      )
    `)
    .eq('status', 'Pending')
    .order('created_at', { ascending: false })

  if (role !== 'super_admin') {
    const { data: reportees } = await supabase
      .from('employees')
      .select('id')
      .eq('reporting_manager_id', empId)
    const ids = (reportees || []).map((r: any) => r.id)
    const fallback = '00000000-0000-0000-0000-000000000000'
    if (ids.length === 0) {
      timeoffQ = timeoffQ.eq('employee_id', fallback)
      ondutyQ  = ondutyQ.eq('employee_id', fallback)
    } else {
      timeoffQ = timeoffQ.in('employee_id', ids)
      ondutyQ  = ondutyQ.in('employee_id', ids)
    }
  }

  const [leaveRes, timeoffRes, ondutyRes] = await Promise.all([
    leaveQ, timeoffQ, ondutyQ,
  ])

  const totalCount =
    (leaveRes.data?.length || 0) +
    (timeoffRes.data?.length || 0) +
    (ondutyRes.data?.length || 0)

  if (countOnly) return NextResponse.json({ count: totalCount })

  return NextResponse.json({
    leaves:   leaveRes.data   || [],
    timeoffs: timeoffRes.data || [],
    onduties: ondutyRes.data  || [],
    count: totalCount,
  })
}
