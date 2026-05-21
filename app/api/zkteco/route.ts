/**
 * Comfy Works — ZKTeco ADMS Push Receiver
 * File: app/api/zkteco/route.ts
 *
 * The ZKTeco X2008 uses the ADMS protocol to push attendance data.
 * Configure on device: Webserver Set → Server IP = your Vercel domain
 *
 * Handles:
 *   GET  /api/zkteco?SN=...&options=all  → device check-in
 *   POST /api/zkteco?SN=...&table=ATTLOG → attendance push
 *   GET  /api/zkteco?SN=...              → command poll
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Cache employee map (in-memory, reloads on cold start)
let empCache: Map<number, { id: string; employee_no: string }> | null = null;
let empCacheAt = 0;

async function getEmpMap() {
  const now = Date.now();
  if (empCache && now - empCacheAt < 10 * 60 * 1000) return empCache;

  const supabase = admin();
  const { data } = await supabase
    .from('employees')
    .select('id, employee_no, zkteco_user_id')
    .eq('status', 'Active')
    .not('zkteco_user_id', 'is', null);

  empCache = new Map((data ?? []).map(e => [e.zkteco_user_id, { id: e.id, employee_no: e.employee_no }]));
  empCacheAt = now;
  return empCache;
}

// POST — device pushes attendance logs
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const sn    = searchParams.get('SN') || 'unknown';

  // Only handle attendance logs
  if (table !== 'ATTLOG') {
    return new NextResponse('OK', { status: 200 });
  }

  try {
    const body = await request.text();
    // ADMS format: "UserID\tDateTime\tStatus\tVerify\tWorkCode\n"
    // Example: "4\t2026-05-21 17:33:00\t0\t1\t0\n"
    const lines = body.trim().split('\n').filter(Boolean);

    if (!lines.length) return new NextResponse('OK', { status: 200 });

    const supabase = admin();
    const empMap   = await getEmpMap();

    let inserted = 0;
    let skipped  = 0;

    for (const line of lines) {
      const parts  = line.trim().split('\t');
      if (parts.length < 3) continue;

      const zkUserId  = parseInt(parts[0], 10);
      const rawTime   = parts[1]; // "2026-05-21 17:33:00"
      const statusCode = parseInt(parts[2], 10); // 0=Check-In, 1=Check-Out

      if (isNaN(zkUserId) || !rawTime) continue;

      const emp = empMap.get(zkUserId);
      if (!emp) {
        console.warn(`ZK push: unknown user ID ${zkUserId}`);
        continue;
      }

      // Parse as IST (UTC+5:30)
      const punchedAt = new Date(rawTime.replace(' ', 'T') + '+05:30').toISOString();
      const punchType = statusCode === 1 ? 'Check-Out' : 'Check-In';

      // Dedup check
      const { data: existing } = await supabase
        .from('attendance_punches')
        .select('id')
        .eq('employee_id', emp.id)
        .eq('punched_at', punchedAt)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { error } = await supabase
        .from('attendance_punches')
        .insert({
          employee_id: emp.id,
          punched_at:  punchedAt,
          punch_type:  punchType,
          device_id:   `ZKTECO_PUSH_${sn}`,
          raw_data:    { raw_line: line, sn },
        });

      if (!error) {
        inserted++;
        console.log(`PUSH: ${emp.employee_no} ${punchType} at ${punchedAt}`);
      } else {
        console.error(`PUSH insert error: ${error.message}`);
      }
    }

    console.log(`ZKTeco PUSH from ${sn}: ${inserted} inserted, ${skipped} duplicate`);

    // ADMS response format required by device
    return new NextResponse('OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (err) {
    console.error('ZKTeco PUSH error:', err);
    return new NextResponse('OK', { status: 200 }); // always 200 to device
  }
}

// GET — device check-in / command poll
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sn      = searchParams.get('SN') || '';
  const options = searchParams.get('options');

  // Standard ADMS response telling device to send attendance logs
  if (options === 'all') {
    // Return server time + options for device
    const now = new Date();
    const serverTime = now.toISOString().replace('T', ' ').slice(0, 19);
    return new NextResponse(
      `GET OPTION FROM: ${sn}\nATTLOG: 1\nOPERLOG: 1\nATTPHOTO: 0\nTimeZone: 5.5\nServerVer: 2.4.2\nTransTimes: 00:00;14:05\nTransInterval: 1\nTransFlag: TransData AttLog\nTimeStamp: ${Math.floor(Date.now()/1000)}\n`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Server-Time': serverTime }
      }
    );
  }

  // Device polling for commands — respond with no commands
  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
}
