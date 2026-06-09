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
  return { ok: true }
}

const VALID_ROUNDING = ['none', 'down_15', 'down_30', 'nearest_15', 'nearest_30']

function sanitizeCategory(body: any, isCreate = false) {
  const out: any = {}
  if (typeof body.name === 'string') out.name = body.name.trim()
  if (typeof body.code === 'string') out.code = body.code.trim() || null

  if (body.late_grace_minutes != null) out.late_grace_minutes = Math.max(0, parseInt(body.late_grace_minutes) || 0)
  if (body.early_grace_minutes != null) out.early_grace_minutes = Math.max(0, parseInt(body.early_grace_minutes) || 0)

  if (body.half_day_if_hours_below != null) out.half_day_if_hours_below = Math.max(0, parseFloat(body.half_day_if_hours_below) || 0)
  if (body.absent_if_hours_below != null) out.absent_if_hours_below = Math.max(0, parseFloat(body.absent_if_hours_below) || 0)

  if (body.late_threshold_hours != null) out.late_threshold_hours = Math.max(0, parseFloat(body.late_threshold_hours) || 0)
  if (body.early_threshold_hours != null) out.early_threshold_hours = Math.max(0, parseFloat(body.early_threshold_hours) || 0)

  if (typeof body.half_day_unpaid === 'boolean') out.half_day_unpaid = body.half_day_unpaid
  if (typeof body.holiday_paid === 'boolean') out.holiday_paid = body.holiday_paid

  if (typeof body.ot_rounding === 'string' && VALID_ROUNDING.includes(body.ot_rounding)) {
    out.ot_rounding = body.ot_rounding
  }

  if (typeof body.is_active === 'boolean') out.is_active = body.is_active

  if (isCreate && !out.name) return { error: 'Name is required' }
  if (out.name === '') return { error: 'Name cannot be empty' }

  return { data: out }
}

// GET /api/categories — list all with employee counts
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = createServiceSupabase()
  const { data: cats, error } = await svc
    .from('categories')
    .select('*')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: counts } = await svc
    .from('employees')
    .select('category_id')
    .eq('status', 'Active')

  const countMap = new Map<string, number>()
  for (const row of counts || []) {
    if (row.category_id) {
      countMap.set(row.category_id, (countMap.get(row.category_id) ?? 0) + 1)
    }
  }

  const enriched = (cats || []).map(c => ({
    ...c,
    employee_count: countMap.get(c.id) ?? 0,
  }))

  return NextResponse.json({ categories: enriched })
}

// POST /api/categories — create
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const result = sanitizeCategory(body, true)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('categories')
    .insert({ ...result.data, is_active: true })
    .select()
    .single()

  if (error) {
    const msg = error.message.includes('unique') ? 'Code already exists' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ category: data })
}
