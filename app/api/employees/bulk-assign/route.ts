export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const KEEP = '__keep__'
const CLEAR = '__clear__'

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
    .from('user_accounts').select('role, employee_id').eq('id', user.id).single()
  if (account?.role !== 'super_admin') {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true, employeeId: account?.employee_id || null }
}

/**
 * POST /api/employees/bulk-assign
 *
 * Body:
 * {
 *   employee_ids: string[],                     // selected employees
 *   department_id?: string | '__keep__' | '__clear__',
 *   category_id?: string | '__keep__' | '__clear__',
 *   shift_id?: string | '__keep__' | '__clear__',
 *   reprocess_from_date?: string                // e.g. '2026-06-01' (optional)
 * }
 *
 * Behavior:
 *  - 'undefined' or '__keep__' → don't touch that field
 *  - '__clear__'                → set to NULL
 *  - any UUID                   → set to that value
 *
 * Each employee gets one audit_log row capturing old → new for the changed fields.
 * If reprocess_from_date is provided, calls /api/cron/process-attendance for
 * each date from that date through today (IST), inclusive.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const employeeIds: string[] = Array.isArray(body.employee_ids) ? body.employee_ids : []
  if (employeeIds.length === 0) {
    return NextResponse.json({ error: 'No employees selected' }, { status: 400 })
  }
  if (employeeIds.length > 200) {
    return NextResponse.json({ error: 'Too many employees in one batch (max 200)' }, { status: 400 })
  }

  // Build the update patch
  const patch: any = { updated_at: new Date().toISOString() }
  const changeFields: string[] = []

  const resolveField = (val: any): { include: boolean; value: any } => {
    if (val == null || val === KEEP) return { include: false, value: null }
    if (val === CLEAR) return { include: true, value: null }
    if (typeof val === 'string' && val.length > 0) return { include: true, value: val }
    return { include: false, value: null }
  }

  const deptRes = resolveField(body.department_id)
  const catRes = resolveField(body.category_id)
  const shiftRes = resolveField(body.shift_id)

  if (deptRes.include) { patch.department_id = deptRes.value; changeFields.push('department_id') }
  if (catRes.include) { patch.category_id = catRes.value; changeFields.push('category_id') }
  if (shiftRes.include) { patch.shift_id = shiftRes.value; changeFields.push('shift_id') }

  if (changeFields.length === 0) {
    return NextResponse.json({ error: 'No fields selected for update' }, { status: 400 })
  }

  const svc = createServiceSupabase()

  // 1. Capture old values for audit (before update)
  const { data: oldRows, error: fetchErr } = await svc
    .from('employees')
    .select('id, employee_no, department_id, category_id, shift_id, status')
    .in('id', employeeIds)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Filter out inactive employees defensively (shouldn't be selected anyway)
  const validIds = (oldRows || []).filter(r => r.status === 'Active').map(r => r.id)
  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No active employees in selection' }, { status: 400 })
  }

  // 2. Apply the update
  const { error: updateErr } = await svc
    .from('employees')
    .update(patch)
    .in('id', validIds)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 3. Audit log — one row per employee
  const auditRows = (oldRows || [])
    .filter(r => validIds.includes(r.id))
    .map(r => {
      const oldValues: any = {}
      const newValues: any = {}
      for (const field of changeFields) {
        oldValues[field] = (r as any)[field]
        newValues[field] = (patch as any)[field]
      }
      return {
        table_name: 'employees',
        record_id: r.id,
        action: 'BULK_ASSIGN',
        old_values: oldValues,
        new_values: newValues,
        changed_by: auth.employeeId,
        reason: `Bulk assignment from /bulk-assign — ${changeFields.join(', ')}`,
      }
    })

  if (auditRows.length > 0) {
    const { error: auditErr } = await svc.from('audit_log').insert(auditRows)
    if (auditErr) {
      // Update already succeeded; log but don't fail the whole call
      console.error('audit_log insert failed:', auditErr.message)
    }
  }

  // 4. Optional reprocess
  const reprocessResults: Array<{ date: string; ok: boolean; status_breakdown?: any; error?: string }> = []
  if (typeof body.reprocess_from_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.reprocess_from_date)) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://comfy-works.vercel.app'
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      reprocessResults.push({ date: 'all', ok: false, error: 'CRON_SECRET not set; skipped reprocess' })
    } else {
      // Enumerate dates from reprocess_from_date through today (IST)
      const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const todayIST = istNow.toISOString().split('T')[0]
      const dates = enumerateDates(body.reprocess_from_date, todayIST)
      // Cap at 30 dates to be safe
      const limited = dates.slice(0, 30)

      for (const date of limited) {
        try {
          const r = await fetch(`${baseUrl}/api/cron/process-attendance?date=${date}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cronSecret}` },
          })
          const data = await r.json()
          reprocessResults.push({
            date,
            ok: r.ok,
            status_breakdown: data?.status_breakdown,
            error: r.ok ? undefined : data?.error,
          })
        } catch (e: any) {
          reprocessResults.push({ date, ok: false, error: e.message || 'fetch failed' })
        }
      }
    }
  }

  return NextResponse.json({
    updated: validIds.length,
    changed_fields: changeFields,
    skipped: employeeIds.length - validIds.length,
    reprocess: reprocessResults.length > 0 ? reprocessResults : null,
  })
}

function enumerateDates(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (start > end) return result
  const cursor = new Date(start)
  while (cursor <= end) {
    result.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result
}
