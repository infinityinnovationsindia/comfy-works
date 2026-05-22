
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function userClient() {
  const c = cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: (n) => c.get(n)?.value, set: () => {}, remove: () => {} }
  })
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  let query = supabase.from('overtime_requests')
    .select(`*, raised_by_emp:raised_by(first_name,last_name,employee_no), overtime_employees(*, employee:employee_id(first_name,last_name,employee_no))`)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { project_site, date_requested, date_of_ot, time_from, time_to, employees, raised_by } = body

  // Calculate planned hours
  const [fh, fm] = time_from.split(':').map(Number)
  const [th, tm] = time_to.split(':').map(Number)
  const planned_hours = ((th * 60 + tm) - (fh * 60 + fm)) / 60

  const { data: ot, error } = await supabase.from('overtime_requests').insert({
    project_site, date_requested, date_of_ot, time_from, time_to,
    planned_hours: Math.max(0, planned_hours), raised_by, status: 'Pending'
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert employee list
  if (employees?.length) {
    await supabase.from('overtime_employees').insert(
      employees.map((e: any) => ({ overtime_request_id: ot.id, employee_id: e.employee_id, remark: e.remark || null }))
    )
  }

  // Notify Shailoo via WhatsApp
  const { data: shailoo } = await supabase.from('employees').select('id,first_name,last_name').eq('employee_no','CF-002').single()
  if (shailoo) {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ot_approval',
        to: shailoo.id,
        message: `OT Request for ${employees?.length || 0} employees on ${date_of_ot} at ${project_site}. ${time_from}–${time_to} (${planned_hours.toFixed(1)} hrs). TAP TO REVIEW: ${process.env.NEXT_PUBLIC_APP_URL}/overtime/${ot.id}`
      })
    }).catch(() => {})
  }

  return NextResponse.json(ot)
}
