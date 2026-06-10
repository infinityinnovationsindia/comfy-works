/**
 * Cron route — processes attendance for a date.
 *
 * Was 267 lines of inline logic that duplicated lib/attendance-processor.ts.
 * Now a thin caller: parses the date, delegates to processDateAttendance().
 *
 * Both this endpoint and the admin reprocess endpoint now run the SAME engine,
 * so they can never drift again.
 *
 * Behaviour preserved exactly:
 *   - GET and POST both supported
 *   - Optional ?date=YYYY-MM-DD query param; default = today IST
 *   - Returns JSON { date, is_today, processed, errors, status_breakdown }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { processDateAttendance } from '@/lib/attendance-processor';

export async function POST(req: Request) {
  return handler(req);
}

export async function GET(req: Request) {
  return handler(req);
}

async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');

    // Default to today in IST (matches previous behaviour)
    const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayIST = istNow.toISOString().split('T')[0];
    const targetDate = dateParam || todayIST;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const result = await processDateAttendance(targetDate);

    // Shape the response to match what existing callers (cron, dashboard, scripts) expect.
    return NextResponse.json({
      date:             targetDate,
      is_today:         targetDate === todayIST,
      processed:        result.processed,
      skipped:          result.skipped,
      errors:           result.errors,
      status_breakdown: result.statusAfter,
      status_before:    result.statusBefore,
      message:          `Processed ${result.processed} employees for ${targetDate}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
