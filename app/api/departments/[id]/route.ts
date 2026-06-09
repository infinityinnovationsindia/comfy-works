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

// PATCH /api/departments/[id] — update
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const update: any = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (typeof body.code === 'string') update.code = body.code.trim() || null
  if (typeof body.description === 'string') update.description = body.description.trim() || null
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active

  if (update.name === '') {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
  }

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('departments')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    const msg = error.message.includes('unique') ? 'Code already exists' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ department: data })
}

// DELETE /api/departments/[id]
// Safe: FK on employees is ON DELETE SET NULL — employees are NOT deleted.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = createServiceSupabase()
  const { error } = await svc.from('departments').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
