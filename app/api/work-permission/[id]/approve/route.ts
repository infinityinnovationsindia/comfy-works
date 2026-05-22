
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = adminClient()
  const { action } = await req.json()
  const status = action === 'approve' ? 'Approved' : 'Rejected'
  const update: any = { status }
  if (action === 'approve') update.kush_approved_at = new Date().toISOString()

  await supabase.from('work_permissions').update(update).eq('id', params.id)

  if (action === 'approve') {
    // Notify security + all employees
    const { data: emps } = await supabase.from('work_permission_employees')
      .select('employee:employee_id(id,first_name,last_name)').eq('work_permission_id', params.id)
    const { data: wp } = await supabase.from('work_permissions').select('*').eq('id', params.id).single()
    for (const emp of emps || []) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'work_perm_approved', to: (emp.employee as any).id,
          message: `Work Permission APPROVED for ${wp?.date_of_work}. You may work from ${wp?.time_from} to ${wp?.time_to}. Show this message at security gate.` })
      }).catch(() => {})
    }
  }
  return NextResponse.json({ ok: true })
}
