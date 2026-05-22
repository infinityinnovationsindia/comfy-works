export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'

// ── GET /iclock/getrequest — device heartbeat ─────────────────────────────
// The device calls this every `Delay` seconds (we set Delay=10 in cdata config).
// Server must respond with 200 OK as fast as possible.
// If this is slow (Vercel cold start) → device marks connection failed
// and waits ErrorDelay seconds before retrying.
//
// Response when no commands: just "OK"
// Response with a command: "C:command_string"
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const sn = searchParams.get('SN') || 'unknown'

  // Fast 200 OK — don't do any DB calls here, speed is critical
  console.log(`[ZKTeco] Heartbeat | SN=${sn}`)

  return new Response('OK', {
    status: 200,
    headers: {
      'Content-Type':  'text/plain',
      'Cache-Control': 'no-cache',
    },
  })
}
