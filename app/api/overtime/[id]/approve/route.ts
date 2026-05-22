
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = adminClient()
  const { approver_id, approver_role, action, comment } = await req.json()
  const { id } = params

  const { data: ot } = await supabase.from('overtime_requests').select('*').eq('id', id).single()
  if (!ot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reject') {
    await supabase.from('overtime_requests').update({ status: 'Rejected' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  let update: any = {}
  let nextNotifyRole = null

  if (approver_role === 'shailoo' && ot.status === 'Pending') {
    update = { status: 'Shailoo_Approved', shailoo_approved_at: new Date().toISOString() }
    nextNotifyRole = 'kush'
  } else if (approver_role === 'kush' && ot.status === 'Shailoo_Approved') {
    update = { status: 'Approved', kush_approved_at: new Date().toISOString() }
    // Notify all employees
    const { data: emps } = await supabase.from('overtime_employees')
      .select('employee:employee_id(id,first_name,last_name)').eq('overtime_request_id', id)
    for (const emp of emps || []) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ot_approved', to: (emp.employee as any).id,
          message: `Your OT has been approved for ${ot.date_of_ot}. Time: ${ot.time_from}–${ot.time_to} at ${ot.project_site}` })
      }).catch(() => {})
    }
  } else {
    return NextResponse.json({ error: 'Invalid approval step' }, { status: 400 })
  }

  await supabase.from('overtime_requests').update(update).eq('id', id)

  if (nextNotifyRole === 'kush') {
    const { data: kush } = await supabase.from('employees').select('id').eq('employee_no','CF-004').single()
    if (kush) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ot_kush_approval', to: kush.id,
          message: `Shailoo approved OT for ${ot.date_of_ot}. Your final approval needed. TAP: ${process.env.NEXT_PUBLIC_APP_URL}/overtime/${id}` })
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
