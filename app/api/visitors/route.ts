
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const search = searchParams.get('search')

  let query = supabase.from('visitors')
    .select(`*, host:host_employee_id(first_name,last_name,employee_no)`)
    .order('time_in', { ascending: false })

  if (date) {
    query = query.gte('time_in', `${date}T00:00:00+05:30`).lte('time_in', `${date}T23:59:59+05:30`)
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { name, company, purpose, host_employee_id, photo_url, id_proof_type, id_proof_number, security_notes } = body

  const { data: visitor, error } = await supabase.from('visitors').insert({
    name, company, purpose, host_employee_id, photo_url,
    id_proof_type, id_proof_number, security_notes,
    time_in: new Date().toISOString()
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify host
  if (host_employee_id) {
    const { data: host } = await supabase.from('employees').select('first_name').eq('id', host_employee_id).single()
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'visitor', to: host_employee_id,
        message: `${name} from ${company || 'unknown'} is at the gate to see you. Purpose: ${purpose}` })
    }).catch(() => {})
  }
  return NextResponse.json(visitor)
}
