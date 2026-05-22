
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  let query = supabase.from('petty_cash_requests')
    .select(`*, employee:employee_id(first_name,last_name,employee_no), approver:approved_by(first_name,last_name)`)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { employee_id, department, amount, purpose } = body

  const { data, error } = await supabase.from('petty_cash_requests').insert({
    employee_id, department, amount, purpose, status: 'Pending'
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify Kiran + Neal
  for (const empNo of ['CF-031','CF-080']) {
    const { data: approver } = await supabase.from('employees').select('id').eq('employee_no', empNo).single()
    if (approver) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'petty_cash', to: approver.id,
          message: `Petty cash request: ₹${amount} for ${purpose} (${department} dept). TAP TO REVIEW: ${process.env.NEXT_PUBLIC_APP_URL}/petty-cash/${data.id}` })
      }).catch(() => {})
    }
  }
  return NextResponse.json(data)
}
