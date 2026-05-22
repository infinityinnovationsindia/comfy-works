
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  let query = supabase.from('work_permissions')
    .select(`*, raised_by_emp:raised_by(first_name,last_name,employee_no), work_permission_employees(*, employee:employee_id(first_name,last_name,employee_no))`)
    .order('created_at', { ascending: false })
  if (date) query = query.eq('date_of_work', date)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { project_site, date_requested, date_of_work, time_from, time_to, sip_pip, employees, raised_by } = body

  const { data: wp, error } = await supabase.from('work_permissions').insert({
    project_site, date_requested, date_of_work, time_from, time_to,
    sip_pip: sip_pip || 'N/A', raised_by, status: 'Pending'
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (employees?.length) {
    await supabase.from('work_permission_employees').insert(
      employees.map((e: any) => ({ work_permission_id: wp.id, employee_id: e.employee_id, remark: e.remark || null }))
    )
  }

  // Notify Kush
  const { data: kush } = await supabase.from('employees').select('id').eq('employee_no','CF-004').single()
  if (kush) {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'work_permission', to: kush.id,
        message: `Work Permission request for ${employees?.length || 0} employees on ${date_of_work}. Time: ${time_from}–${time_to}. SIP/PIP: ${sip_pip || 'N/A'}. TAP TO APPROVE: ${process.env.NEXT_PUBLIC_APP_URL}/work-permission/${wp.id}` })
    }).catch(() => {})
  }

  return NextResponse.json(wp)
}
