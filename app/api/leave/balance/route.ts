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

export async function GET(request: Request) {
  try {
    const supabase = createSupabase()
    const { searchParams } = new URL(request.url)
    const reqEmployeeId = searchParams.get('employee_id') // admin can pass another employee's id

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: account } = await supabase
      .from('user_accounts').select('role, employee_id').eq('id', user.id).single()

    // Determine which employee's balance to return
    const adminRoles = ['super_admin', 'hr_assistant', 'supervisor', 'production_head', 'design_head', 'project_head', 'accounts']
    const isAdmin = adminRoles.includes(account?.role ?? '')
    const empId = (reqEmployeeId && isAdmin) ? reqEmployeeId : account?.employee_id

    if (!empId) return NextResponse.json({ pl_earned: 0, pl_used: 0, pl_balance: 0, employment_type: 'Permanent' })

    const { data: emp } = await supabase
      .from('employees').select('employment_type').eq('id', empId).single()

    const now = new Date()
    const fy = now.getMonth() >= 3
      ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
      : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`

    const { data: lb } = await supabase
      .from('leave_balances').select('pl_earned, pl_used, pl_balance')
      .eq('employee_id', empId).eq('financial_year', fy).single()

    return NextResponse.json({
      pl_earned:       lb?.pl_earned  ?? 0,
      pl_used:         lb?.pl_used    ?? 0,
      pl_balance:      lb?.pl_balance ?? 0,
      employment_type: emp?.employment_type ?? 'Permanent',
      financial_year:  fy,
    })
  } catch (err: any) {
    console.error('leave/balance error:', err)
    return NextResponse.json({ pl_earned: 0, pl_used: 0, pl_balance: 0, employment_type: 'Permanent' })
  }
}
