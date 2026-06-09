import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getCurrentEmployeeId() {
  const cookieStore = cookies()
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return null
  const { data: account } = await supa
    .from('user_accounts')
    .select('employee_id')
    .eq('id', user.id)
    .single()
  return account?.employee_id ?? null
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
  const { department, amount, purpose } = body

  // Derive employee_id from session if not sent
  let employee_id = body.employee_id
  if (!employee_id) employee_id = await getCurrentEmployeeId()

  if (!employee_id) {
    return NextResponse.json(
      { error: 'Unable to identify the requesting employee. Please log out and back in.' },
      { status: 401 }
    )
  }
  if (!amount || !purpose) {
    return NextResponse.json(
      { error: 'Amount and purpose are required.' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('petty_cash_requests')
    .insert({ employee_id, department, amount, purpose, status: 'Pending' })
    .select()
    .single()

  if (error) {
    console.error('Petty cash insert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notify Kiran + Neal
  for (const empNo of ['CF-031', 'CF-080']) {
    const { data: approver } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_no', empNo)
      .single()
    if (approver) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'petty_cash',
          to: approver.id,
          message: `Petty cash request: ₹${amount} for ${purpose} (${department} dept). TAP TO REVIEW: ${process.env.NEXT_PUBLIC_APP_URL}/petty-cash/${data.id}`
        })
      }).catch(() => {})
    }
  }

  return NextResponse.json(data)
}