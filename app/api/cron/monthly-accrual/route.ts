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

// Handles both POST (manual trigger from Settings) and GET (Vercel cron)
export async function POST() { return handler() }
export async function GET()  { return handler() }

async function handler() {
  try {
    const supabase = createSupabase()

    // Calculate previous month date range
    const now  = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthStart = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay    = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()
    const monthEnd   = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${lastDay}`

    // Current financial year
    const fy = now.getMonth() >= 3
      ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
      : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`

    // Get all active employees
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, employment_type, date_of_joining')
      .eq('status', 'Active')

    if (empErr || !employees) {
      return NextResponse.json({
        success: false,
        message: `Failed to fetch employees: ${empErr?.message}`,
        processed: 0,
      })
    }

    let processed = 0
    let skipped   = 0
    const errors: string[] = []

    for (const emp of employees) {
      try {
        // Check minimum service period (must have joined at least 20 days ago for permanent, 30 for others)
        const joinDate    = new Date(emp.date_of_joining)
        const isPermanent = emp.employment_type === 'Permanent'
        const threshold   = isPermanent ? 20 : 30

        // Count days actually attended last month
        const { data: attendance } = await supabase
          .from('attendance_daily')
          .select('status')
          .eq('employee_id', emp.id)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .in('status', ['P', 'PL', 'HPL']) // Only count days when present or on paid leave

        const daysAttended = attendance?.length ?? 0

        // PL accrual rule: 1 PL per 20 days (permanent) or 30 days (probationer)
        if (daysAttended < threshold) {
          skipped++
          continue
        }

        const plEarned = isPermanent
          ? Math.floor(daysAttended / 20)
          : Math.floor(daysAttended / 30)

        if (plEarned === 0) {
          skipped++
          continue
        }

        // Upsert leave balance
        const { data: existing } = await supabase
          .from('leave_balances')
          .select('id, pl_earned')
          .eq('employee_id', emp.id)
          .eq('financial_year', fy)
          .single()

        if (existing) {
          const cap = isPermanent ? 15 : 10
          const newEarned = Math.min((existing.pl_earned ?? 0) + plEarned, cap)
          await supabase
            .from('leave_balances')
            .update({ pl_earned: newEarned })
            .eq('id', existing.id)
        } else {
          await supabase
            .from('leave_balances')
            .insert({
              employee_id:    emp.id,
              financial_year: fy,
              pl_earned:      plEarned,
              pl_used:        0,
            })
        }

        processed++
      } catch (e: any) {
        errors.push(`${emp.id}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success:    true,
      message:    `Monthly PL accrual complete for ${monthStart.slice(0, 7)}`,
      processed,
      skipped,
      errors,
      month:      monthStart.slice(0, 7),
      fy,
    })
  } catch (err: any) {
    console.error('monthly-accrual error:', err)
    return NextResponse.json({
      success: false,
      message: `Error: ${err.message}`,
      processed: 0,
    })
  }
}
