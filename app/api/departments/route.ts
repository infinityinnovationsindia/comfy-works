export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function createAuthSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
}

function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = createAuthSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  const { data: account } = await supabase
    .from('user_accounts').select('role').eq('id', user.id).single()
  if (account?.role !== 'super_admin') {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true, user, account }
}

// GET /api/departments — list all with employee counts
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = createServiceSupabase()
  const { data: depts, error } = await svc
    .from('departments')
    .select('*')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add employee count per department
  const { data: counts } = await svc
    .from('employees')
    .select('department_id')
    .eq('status', 'Active')

  const countMap = new Map<string, number>()
  for (const row of counts || []) {
    if (row.department_id) {
      countMap.set(row.department_id, (countMap.get(row.department_id) ?? 0) + 1)
    }
  }

  const enriched = (depts || []).map(d => ({
    ...d,
    employee_count: countMap.get(d.id) ?? 0,
  }))

  return NextResponse.json({ departments: enriched })
}

// POST /api/departments — create
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name = (body?.name ?? '').trim()
  const code = (body?.code ?? '').trim() || null
  const description = (body?.description ?? '').trim() || null

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('departments')
    .insert({ name, code, description, is_active: true })
    .select()
    .single()

  if (error) {
    const msg = error.message.includes('unique') ? 'Code already exists' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ department: data })
}
