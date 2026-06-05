export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
}

// GET /api/employees/simple
// Returns minimal employee list for dropdowns.
//
// Query params:
//   ?mode=workers  -> only people selectable as workers (excludes partners + test users) [DEFAULT]
//   ?mode=hosts    -> only people who can host visitors (partners + designated hosts)
//   ?mode=all      -> all active employees
//
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: account } = await supabase
      .from('user_accounts').select('role').eq('id', user.id).single()

    const allowed = ['super_admin', 'hr_assistant', 'supervisor', 'production_head', 'design_head', 'project_head', 'accounts', 'security']
    if (!allowed.includes(account?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const mode = request.nextUrl.searchParams.get('mode') ?? 'workers'

    let query = supabase
      .from('employees')
      .select('id, employee_no, first_name, last_name, department, designation, selectable_as_worker, is_visitor_host')
      .eq('status', 'Active')
      .order('first_name')

    if (mode === 'workers') {
      query = query.eq('selectable_as_worker', true)
    } else if (mode === 'hosts') {
      query = query.eq('is_visitor_host', true)
    }
    // mode === 'all' applies no extra filter

    const { data: employees } = await query

    return NextResponse.json({ employees: employees || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}