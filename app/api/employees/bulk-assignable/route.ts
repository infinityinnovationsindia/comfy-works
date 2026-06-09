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

// GET /api/employees/bulk-assignable
// Returns active employees + all lookup data needed by the bulk tool.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = createServiceSupabase()

  const [empRes, deptRes, catRes, shiftRes] = await Promise.all([
    svc.from('employees')
      .select('id, employee_no, first_name, last_name, location, department_id, category_id, shift_id, is_biometric_exempt')
      .eq('status', 'Active')
      .order('employee_no'),
    svc.from('departments').select('id, name, code').eq('is_active', true).order('name'),
    svc.from('categories').select('id, name, code').eq('is_active', true).order('name'),
    svc.from('shifts').select('id, name, start_time, end_time').order('start_time'),
  ])

  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 })

  return NextResponse.json({
    employees: empRes.data || [],
    departments: deptRes.data || [],
    categories: catRes.data || [],
    shifts: shiftRes.data || [],
  })
}
