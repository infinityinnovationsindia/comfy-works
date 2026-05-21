export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
}

export async function GET() {
  try {
    const supabase = createSupabase()

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: account } = await supabase
      .from('user_accounts')
      .select('employee_id')
      .eq('id', user.id)
      .single()

    if (!account?.employee_id) {
      return NextResponse.json({ pl_earned: 0, pl_used: 0, pl_balance: 0, employment_type: 'Permanent' })
    }

    const { data: emp } = await supabase
      .from('employees')
      .select('employment_type, date_of_joining')
      .eq('id', account.employee_id)
      .single()

    const now = new Date()
    const fy = now.getMonth() >= 3
      ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
      : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`

    const { data: lb } = await supabase
      .from('leave_balances')
      .select('pl_earned, pl_used, pl_balance')
      .eq('employee_id', account.employee_id)
      .eq('financial_year', fy)
      .single()

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
