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

export async function GET() {
  try {
    const supabase = createSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: account } = await supabase
      .from('user_accounts').select('employee_id').eq('id', user.id).single()
    if (!account?.employee_id) return NextResponse.json({ requests: [] })

    const { data: requests, error } = await supabase
      .from('time_off_permissions')
      .select('id, date, time_out, time_in_expected, time_in_actual, purpose, status, created_at')
      .eq('employee_id', account.employee_id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ requests: requests || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
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
    const { date, time_out, time_in_expected, purpose, on_behalf_employee_id } = body

    if (!date || !time_out || !purpose?.trim()) {
      return NextResponse.json({ error: 'Date, Time Out, and Purpose are required' }, { status: 400 })
    }

    const adminRoles = ['super_admin','hr_assistant','supervisor','production_head','design_head','project_head']
    const isAdmin = adminRoles.includes(account.role)
    const targetEmpId = (on_behalf_employee_id && isAdmin) ? on_behalf_employee_id : account.employee_id

    // Get supervisor to notify
    const { data: emp } = await supabase
      .from('employees').select('reporting_manager_id').eq('id', targetEmpId).single()

    const { data: req, error } = await supabase
      .from('time_off_permissions')
      .insert({
        employee_id:      targetEmpId,
        date,
        time_out,
        time_in_expected: time_in_expected || null,
        purpose:          purpose.trim(),
        status:           'Pending',
        approved_by:      null,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, id: req.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
