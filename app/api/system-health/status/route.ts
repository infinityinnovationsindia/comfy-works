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

export async function GET() {
  const supabase = createAuthSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (account?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bridgeUrl = process.env.BRIDGE_HEALTH_URL
  const adminUrl = process.env.BRIDGE_ADMIN_URL

  if (!bridgeUrl || !adminUrl) {
    return NextResponse.json({ error: 'BRIDGE URLs not configured' }, { status: 500 })
  }

  // Run all 3 checks in parallel
  const [bridgeResult, adminResult, dbResult] = await Promise.all([
    checkBridge(bridgeUrl),
    checkAdmin(adminUrl),
    checkDatabase(),
  ])

  const bridge = bridgeResult.data
  const bridgeError = bridgeResult.error
  const admin = adminResult.data
  const adminError = adminResult.error
  const database = dbResult.data
  const databaseError = dbResult.error

  // Overall status considers all 3 services
  const services = [
    !!bridge,
    !!admin,
    !!database && database.status === 'ok',
  ]
  const upCount = services.filter(Boolean).length
  const overallStatus =
    upCount === 3 ? 'healthy' :
    upCount > 0 ? 'degraded' :
    'down'

  return NextResponse.json({
    overall_status: overallStatus,
    checked_at: new Date().toISOString(),
    bridge: bridge || { status: 'error', error: bridgeError },
    admin: admin || { status: 'error', error: adminError },
    database: database || { status: 'error', error: databaseError },
  })
}

async function checkBridge(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (r.ok) return { data: await r.json(), error: null }
    return { data: null, error: `Bridge returned ${r.status}` }
  } catch (e: any) {
    return { data: null, error: e.message || 'Bridge unreachable' }
  }
}

async function checkAdmin(adminUrl: string) {
  try {
    const r = await fetch(`${adminUrl}/admin/health`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (r.ok) return { data: await r.json(), error: null }
    return { data: null, error: `Admin returned ${r.status}` }
  } catch (e: any) {
    return { data: null, error: e.message || 'Admin service unreachable' }
  }
}

async function checkDatabase() {
  const start = Date.now()
  try {
    const svc = createServiceSupabase()
    // Cheap query: count rows in shifts (small static reference table)
    const { error, count } = await svc
      .from('shifts')
      .select('*', { count: 'exact', head: true })
    const responseMs = Date.now() - start

    if (error) {
      return { data: null, error: error.message }
    }

    return {
      data: {
        status: 'ok',
        response_ms: responseMs,
        region: 'ap-south-1 (Mumbai)',
        shifts_count: count ?? 0,
        checked_at: new Date().toISOString(),
      },
      error: null,
    }
  } catch (e: any) {
    return { data: null, error: e.message || 'Database unreachable' }
  }
}