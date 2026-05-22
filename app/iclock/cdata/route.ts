export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── The exact config text the ZKTeco X2008 expects ────────────────────────
// Every field is required. Wrong values = device silently disconnects.
//
// TimeZone=5.5     → IST (India Standard Time = UTC+5:30). CRITICAL.
//                    If wrong (e.g. 8 for China), device may reject or store wrong times.
// Realtime=1       → Push attendance immediately on each punch (not just at TransTimes)
// Delay=10         → Heartbeat every 10 seconds (device checks for server commands)
// ErrorDelay=10    → Retry after 10s if connection fails (default is 30s — too slow)
// ATTLOGStamp=None → Accept all records (no timestamp filter)
// OPERLOGStamp=9999→ Ignore operation logs
function buildCdataConfig(): string {
  return [
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
    'ErrorDelay=10',
    'Delay=10',
    'TransTimes=00:00;09:00',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog',
    'TimeZone=5.5',
    'Realtime=1',
    'Encrypt=None',
  ].join('\n')
}

// ── GET /iclock/cdata — device registration / heartbeat check-in ──────────
// Called by device on boot and periodically as a heartbeat.
// Must return the config text with correct Content-Type: text/plain
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const sn      = searchParams.get('SN') || 'unknown'
  const options = searchParams.get('options')

  console.log(`[ZKTeco] Device check-in | SN=${sn} | options=${options}`)

  // Log the device connection to Supabase for monitoring
  try {
    const supabase = adminClient()
    await supabase.from('zkteco_device_log').upsert({
      serial_number: sn,
      last_seen:     new Date().toISOString(),
      status:        'online',
    }, { onConflict: 'serial_number' }).select()
    // Note: zkteco_device_log table is optional monitoring — ignore if doesn't exist
  } catch (_) {
    // Table may not exist yet — that's OK, don't crash the route
  }

  // Return the config — MUST be text/plain, MUST end with newline
  return new Response(buildCdataConfig() + '\n', {
    status: 200,
    headers: {
      'Content-Type':  'text/plain',
      'Cache-Control': 'no-cache, no-store',
      'Pragma':        'no-cache',
    },
  })
}

// ── POST /iclock/cdata — device pushes attendance records ─────────────────
// Called on every finger/face punch when Realtime=1.
// Body is plain text, one record per line:
// Format: ATTLOG  UserID  Timestamp  Status  Verify  WorkCode  Reserved
// Example: 5       2024-01-15 08:03:22  1       0       0         0
export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const sn    = searchParams.get('SN') || 'unknown'
  const table = searchParams.get('table') || ''

  const body = await request.text()
  console.log(`[ZKTeco] POST | SN=${sn} | table=${table}`)
  console.log(`[ZKTeco] Body:\n${body}`)

  // Only process attendance logs
  if (!body.includes('ATTLOG') && !table.includes('ATTLOG') && !body.includes('\t')) {
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  const supabase = adminClient()
  const inserted: string[] = []
  const errors:   string[] = []

  // Parse each line
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    // Skip header line "ATTLOG"
    if (line === 'ATTLOG' || line.startsWith('ATTLOG\t')) continue

    // Tab-separated: UserID  Timestamp  Status  Verify  WorkCode  Reserved
    const parts = line.split('\t')
    if (parts.length < 2) continue

    const zkUserId  = parseInt(parts[0], 10)
    const rawTime   = parts[1]   // e.g. "2024-01-15 08:03:22"
    const status    = parts[2] ? parseInt(parts[2], 10) : 0

    if (isNaN(zkUserId) || !rawTime) continue

    // The timestamp from the device is in LOCAL TIME (IST, since TimeZone=5.5)
    // We need to store as UTC in Supabase. IST = UTC+5:30
    // Parse as IST and convert to UTC
    let punchedAtUTC: string
    try {
      // rawTime format: "YYYY-MM-DD HH:MM:SS"
      const [datePart, timePart] = rawTime.split(' ')
      if (!datePart || !timePart) continue
      // Append +05:30 to tell JS this is IST
      const istString = `${datePart}T${timePart}+05:30`
      const date = new Date(istString)
      if (isNaN(date.getTime())) continue
      punchedAtUTC = date.toISOString()
    } catch {
      errors.push(`Could not parse timestamp: ${rawTime}`)
      continue
    }

    // Find the employee in our DB by their ZKTeco user ID
    // Convention: ZK User ID matches the numeric part of CF number
    // CF-001 → zkteco_user_id=1, CF-027 → zkteco_user_id=27
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id, employee_no')
      .eq('zkteco_user_id', zkUserId)
      .single()

    if (empErr || !emp) {
      // Try matching by employee_no suffix
      const cfNo = `CF-${String(zkUserId).padStart(3, '0')}`
      const { data: emp2 } = await supabase
        .from('employees')
        .select('id, employee_no')
        .eq('employee_no', cfNo)
        .single()

      if (!emp2) {
        errors.push(`Employee not found for ZK User ID ${zkUserId}`)
        continue
      }

      // Insert punch record
      const { error: insertErr } = await supabase
        .from('attendance_punches')
        .upsert({
          employee_id: emp2.id,
          punched_at:  punchedAtUTC,
          device_id:   sn,
          raw_data:    { line, zk_user_id: zkUserId, status, sn },
        }, { onConflict: 'employee_id,punched_at' })

      if (insertErr) errors.push(`Insert failed for ${cfNo}: ${insertErr.message}`)
      else inserted.push(`${cfNo} @ ${rawTime}`)

    } else {
      const { error: insertErr } = await supabase
        .from('attendance_punches')
        .upsert({
          employee_id: emp.id,
          punched_at:  punchedAtUTC,
          device_id:   sn,
          raw_data:    { line, zk_user_id: zkUserId, status, sn },
        }, { onConflict: 'employee_id,punched_at' })

      if (insertErr) errors.push(`Insert failed for ${emp.employee_no}: ${insertErr.message}`)
      else inserted.push(`${emp.employee_no} @ ${rawTime}`)
    }
  }

  console.log(`[ZKTeco] Processed: ${inserted.length} inserted, ${errors.length} errors`)
  if (errors.length > 0) console.error(`[ZKTeco] Errors:`, errors)

  // MUST return exactly "OK" — device expects this to confirm receipt
  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}
