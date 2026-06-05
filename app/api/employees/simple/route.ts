export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
}

// GET /api/employees/simple
// Returns minimal employee list for dropdowns — only for admins/supervisors/hr_assistant
export async function GET() {
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

    const { data: employees } = await supabase
      .from('employees')
      .select('id, employee_no, first_name, last_name, department, designation')
      .eq('status', 'Active')
      .order('first_name')

    return NextResponse.json({ employees: employees || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
