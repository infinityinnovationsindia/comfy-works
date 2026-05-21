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
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) { try { cookieStore.set({ name, value, ...options }) } catch {} },
        remove(name: string, options: any) { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
      },
    }
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabase()
  const { id } = params
  const body = await request.json()
  const { type, action, comment } = body

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, employee_id')
    .eq('id', user.id)
    .single()

  if (!account) return NextResponse.json({ error: 'No account' }, { status: 403 })

  const role  = account.role
  const empId = account.employee_id
  const now   = new Date().toISOString()

  // ── LEAVE ─────────────────────────────────────────────────
  if (type === 'leave') {
    const { data: req } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action === 'approve') {
      if (role === 'super_admin') {
        await supabase.from('leave_requests').update({
          status: 'Approved',
          l2_approver_id: empId,
          l2_approved_at: now,
          l2_comment: comment || null,
        }).eq('id', id)

        // Deduct PL balance
        if (['PL','HPL'].includes(req.leave_type) && req.pl_to_deduct) {
          const fy = getFY()
          const { data: bal } = await supabase
            .from('leave_balances')
            .select('*')
            .eq('employee_id', req.employee_id)
            .eq('financial_year', fy)
            .single()
          if (bal) {
            await supabase.from('leave_balances')
              .update({ pl_used: (bal.pl_used || 0) + req.pl_to_deduct })
              .eq('id', bal.id)
          }
        }

        // Update attendance for approved dates
        const dates = getDatesInRange(req.date_from, req.date_to)
        for (const date of dates) {
          await supabase.from('attendance_daily').upsert({
            employee_id: req.employee_id,
            date,
            status: req.leave_type,
            leave_id: id,
          }, { onConflict: 'employee_id,date' })
        }

        await supabase.from('audit_log').insert({
          table_name: 'leave_requests',
          record_id: id,
          action: 'UPDATE',
          old_values: { status: req.status },
          new_values: { status: 'Approved' },
          changed_by: empId,
          reason: comment || 'Final approval',
        })
      } else {
        await supabase.from('leave_requests').update({
          status: 'L1_Approved',
          l1_approver_id: empId,
          l1_approved_at: now,
          l1_comment: comment || null,
        }).eq('id', id)
      }
    } else if (action === 'reject') {
      await supabase.from('leave_requests').update({
        status: 'Rejected',
        rejected_by: empId,
        rejected_at: now,
        rejection_reason: comment || null,
      }).eq('id', id)

      await supabase.from('audit_log').insert({
        table_name: 'leave_requests',
        record_id: id,
        action: 'UPDATE',
        old_values: { status: req.status },
        new_values: { status: 'Rejected' },
        changed_by: empId,
        reason: comment || 'Rejected',
      })
    }
  }

  // ── TIME OFF ──────────────────────────────────────────────
  if (type === 'timeoff') {
    const update = action === 'approve'
      ? { status: 'Approved', approved_by: empId, approved_at: now }
      : { status: 'Rejected' }
    await supabase.from('time_off_permissions').update(update).eq('id', id)
  }

  // ── ON DUTY ───────────────────────────────────────────────
  if (type === 'onduty') {
    const update = action === 'approve'
      ? { status: 'Approved', approved_by: empId, approved_at: now }
      : { status: 'Rejected' }
    await supabase.from('on_duty_requests').update(update).eq('id', id)
  }

  return NextResponse.json({ success: true })
}

function getFY(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${String(year + 1).slice(2)}`
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(from)
  const end = new Date(to)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return dates
}
