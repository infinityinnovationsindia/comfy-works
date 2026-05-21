import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams } = new URL(request.url)

  const now = new Date()
  const defaultFY = now.getMonth() >= 3
    ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`

  const fy = searchParams.get('fy') || defaultFY

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all active employees with their leave balances
  const { data: employees } = await supabase
    .from('employees')
    .select(`
      id, employee_no, first_name, last_name, department,
      employment_type, date_of_joining,
      leave_balances(pl_earned, pl_used, pl_balance, financial_year)
    `)
    .eq('status', 'Active')
    .order('employee_no')

  if (!employees) return NextResponse.json({ balances: [] })

  const balances = employees.map(emp => {
    const lb = (emp.leave_balances as any[])?.find(b => b.financial_year === fy)
    return {
      employee_id:     emp.id,
      employee_no:     emp.employee_no,
      first_name:      emp.first_name,
      last_name:       emp.last_name,
      department:      emp.department || '',
      employment_type: emp.employment_type,
      date_of_joining: emp.date_of_joining,
      financial_year:  fy,
      pl_earned:       lb?.pl_earned  || 0,
      pl_used:         lb?.pl_used    || 0,
      pl_balance:      lb?.pl_balance || 0,
    }
  })

  return NextResponse.json({ balances, financial_year: fy })
}
