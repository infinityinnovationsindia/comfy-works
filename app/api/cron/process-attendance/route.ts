
import { NextRequest, NextResponse } from 'next/server';
import { processDateAttendance } from '@/lib/attendance-processor';

// Called daily by Vercel Cron or external trigger
// Add to vercel.json: { "crons": [{ "path": "/api/cron/process-attendance", "schedule": "30 18 * * *" }] }
// 18:30 UTC = midnight IST

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Process yesterday IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  istNow.setDate(istNow.getDate() - 1);
  const dateIST = istNow.toISOString().split('T')[0];

  const result = await processDateAttendance(dateIST);
  return NextResponse.json({ date: dateIST, ...result });
}

// Manual trigger with specific date
export async function POST(request: NextRequest) {
  const { date } = await request.json().catch(() => ({}));
  const dateIST = date ?? new Date().toISOString().split('T')[0];
  const result = await processDateAttendance(dateIST);
  return NextResponse.json({ date: dateIST, ...result });
}
