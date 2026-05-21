/**
 * File location: app/iclock/getrequest/route.ts
 * ZKTeco polls this for server commands — return empty (no commands)
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const sn = new URL(request.url).searchParams.get('SN') ?? '';
  console.log(`ZKTeco poll /iclock/getrequest SN=${sn}`);
  return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
