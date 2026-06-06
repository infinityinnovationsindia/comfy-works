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

export async function GET() {
  const supabase = createSupabase()
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

  let bridge: any = null
  let bridgeError: string | null = null
  try {
    const r = await fetch(bridgeUrl, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (r.ok) bridge = await r.json()
    else bridgeError = `Bridge returned ${r.status}`
  } catch (e: any) {
    bridgeError = e.message || 'Bridge unreachable'
  }

  let admin: any = null
  let adminError: string | null = null
  try {
    const r = await fetch(`${adminUrl}/admin/health`, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
    if (r.ok) admin = await r.json()
    else adminError = `Admin returned ${r.status}`
  } catch (e: any) {
    adminError = e.message || 'Admin service unreachable'
  }

  const overallStatus =
    bridge && admin ? 'healthy' :
    bridge || admin ? 'degraded' :
    'down'

  return NextResponse.json({
    overall_status: overallStatus,
    checked_at: new Date().toISOString(),
    bridge: bridge || { status: 'error', error: bridgeError },
    admin: admin || { status: 'error', error: adminError },
  })
}