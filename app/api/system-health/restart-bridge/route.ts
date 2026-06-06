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

export async function POST(request: Request) {
  const supabase = createAuthSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, employee_id')
    .eq('id', user.id)
    .single()

  if (account?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminUrl = process.env.BRIDGE_ADMIN_URL
  const adminSecret = process.env.BRIDGE_ADMIN_SECRET
  const bridgeHealthUrl = process.env.BRIDGE_HEALTH_URL

  if (!adminUrl || !adminSecret) {
    return NextResponse.json({ error: 'BRIDGE_ADMIN not configured' }, { status: 500 })
  }

  let stateBefore: any = null
  try {
    if (bridgeHealthUrl) {
      const h = await fetch(bridgeHealthUrl, { signal: AbortSignal.timeout(3000), cache: 'no-store' })
      if (h.ok) {
        const data = await h.json()
        stateBefore = {
          uptime_seconds: data.uptime_seconds,
          last_punch_at: data.last_punch_at,
          punches_today: data.punches_today,
        }
      }
    }
  } catch {}

  let reason = 'Manual restart from dashboard'
  try {
    const body = await request.json()
    if (body?.reason && typeof body.reason === 'string') {
      reason = body.reason.slice(0, 500)
    }
  } catch {}

  let restartResult: any = null
  let restartError: string | null = null
  try {
    const r = await fetch(`${adminUrl}/admin/restart-bridge`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminSecret}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    })
    const text = await r.text()
    try { restartResult = JSON.parse(text) } catch { restartResult = { raw: text } }
    if (!r.ok) restartError = restartResult?.error || `Admin returned ${r.status}`
  } catch (e: any) {
    restartError = e.message || 'Admin service unreachable'
  }

  try {
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const svc = createServiceSupabase()
    await svc.from('audit_log').insert({
      table_name: 'system',
      record_id: crypto.randomUUID(),
      action: restartError ? 'BRIDGE_RESTART_FAILED' : 'BRIDGE_RESTART',
      old_values: stateBefore,
      new_values: {
        trigger: 'manual_from_dashboard',
        client_ip: clientIp,
        admin_response: restartResult,
        error: restartError,
      },
      changed_by: account?.employee_id || null,
      reason,
    })
  } catch (logErr) {
    console.error('audit_log write failed:', logErr)
  }

  if (restartError) {
    return NextResponse.json({ error: restartError, detail: restartResult }, { status: 502 })
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Restart triggered',
    admin_response: restartResult,
  })
}