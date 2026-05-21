/**
 * Comfy Works — ZKTeco ADMS Receiver
 * File location: app/iclock/cdata/route.ts
 *
 * ZKTeco X2008 firmware hardcodes /iclock/cdata as the push endpoint.
 * This handles the full ADMS handshake + attendance push.
 *
 * Device serial: 0077142900300
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const DEVICE_ID = 'FACTORY_X2008';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Cache employee map
let empCache: Map<number, { id: string; employee_no: string }> | null = null;
let empCacheAt = 0;

async function getEmpMap() {
  if (empCache && Date.now() - empCacheAt < 10 * 60 * 1000) return empCache;
  const supabase = admin();
  const { data } = await supabase
    .from('employees')
    .select('id, employee_no, zkteco_user_id')
    .eq('status', 'Active')
    .not('zkteco_user_id', 'is', null);
  empCache = new Map((data ?? []).map(e => [e.zkteco_user_id, { id: e.id, employee_no: e.employee_no }]));
  empCacheAt = Date.now();
  return empCache;
}

// GET — device check-in handshake + command poll
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sn      = searchParams.get('SN') ?? '';
  const options = searchParams.get('options');

  console.log(`ZKTeco GET /iclock/cdata SN=${sn} options=${options}`);

  if (options === 'all') {
    // Initial handshake — tell device to push ATTLOGs
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const serverTime = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

    const body = [
      `GET OPTION FROM: ${sn}`,
      `ATTLOGStamp=None`,
      `OPERLOGStamp=9999`,
      `ATTPHOTOStamp=None`,
      `ErrorDelay=30`,
      `Delay=10`,
      `TransTimes=00:00;23:59`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog`,
      `TimeZone=5`,
      `Realtime=1`,
      `Encrypt=None`,
      `ServerVer=2.4.2`,
      `PushProtVer=2.4.2`,
      `PushOptionsFlag=1`,
      `ServerTime=${serverTime}`,
    ].join('\n');

    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
    });
  }

  // Command poll — no commands
  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
}

// POST — device pushes attendance records
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sn    = searchParams.get('SN') ?? '';
  const table = searchParams.get('table') ?? '';

  console.log(`ZKTeco POST /iclock/cdata SN=${sn} table=${table}`);

  if (table !== 'ATTLOG') {
    return new NextResponse('OK', { status: 200 });
  }

  try {
    const body   = await request.text();
    const lines  = body.trim().split('\n').filter(Boolean);
    const empMap = await getEmpMap();
    const supabase = admin();

    let inserted = 0;
    const rows = [];

    for (const line of lines) {
      // ADMS format: "UserID\tDateTime\tStatus\tVerify\tWorkCode\tReserved"
      const parts = line.trim().split('\t');
      if (parts.length < 2) continue;

      const zkId    = parseInt(parts[0].trim(), 10);
      const dateStr = parts[1].trim();
      const status  = parseInt(parts[2]?.trim() ?? '0', 10);

      if (isNaN(zkId) || !dateStr.match(/\d{4}-\d{2}-\d{2}/)) continue;

      const emp = empMap.get(zkId);
      if (!emp) { console.warn(`ZK push: unknown user ${zkId}`); continue; }

      const punchedAt = new Date(dateStr.replace(' ', 'T') + '+05:30').toISOString();
      const punchType = status === 1 ? 'Check-Out' : 'Check-In';

      rows.push({
        employee_id: emp.id,
        punched_at:  punchedAt,
        punch_type:  punchType,
        device_id:   DEVICE_ID,
        raw_data:    { src: 'adms_push', sn, zkId, dateStr, status },
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('attendance_punches')
        .upsert(rows, { onConflict: 'employee_id,punched_at', ignoreDuplicates: true });

      if (!error) {
        inserted = rows.length;
        console.log(`ZKTeco PUSH from ${sn}: ${inserted} punch(es) — ${rows.map(r => r.punch_type + ' ' + r.punched_at).join(', ')}`);
      } else {
        console.error(`ZKTeco PUSH insert error: ${error.message}`);
      }
    }

    // ADMS response: acknowledge with record count
    return new NextResponse(`OK: ${inserted}`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (err: any) {
    console.error('ZKTeco PUSH error:', err.message);
    return new NextResponse('OK', { status: 200 }); // always 200 so device doesn't retry endlessly
  }
}
