/**
 * /api/admin/reprocess-attendance
 *
 * Single route, branches on body.action:
 *   - "start"  → validates params, creates reprocess_runs row, returns run_id + plan
 *   - "batch"  → processes ONE date for the run, returns per-date result
 *   - "finish" → marks run completed/failed/cancelled
 *
 * Client iterates: start → batch (× N dates) → finish.
 * Each batch is one Supabase round-trip per employee, well under any
 * serverless timeout for our 45-employee scale.
 *
 * Auth: super_admin or accounts only.
 */
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { processDateAttendance } from '@/lib/attendance-processor';

const ALLOWED_ROLES = ['super_admin', 'accounts'];
const MAX_DATE_RANGE_DAYS = 30;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getCurrentEmployee() {
  const cookieStore = cookies();
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;

  const { data: account } = await supa
    .from('user_accounts')
    .select('employee_id, role')
    .eq('id', user.id)
    .single();

  if (!account || !ALLOWED_ROLES.includes(account.role)) return null;

  const { data: emp } = await supa
    .from('employees')
    .select('id, first_name, last_name')
    .eq('id', account.employee_id)
    .single();

  return emp ? { ...emp, role: account.role } : null;
}

/** Add days to YYYY-MM-DD, returning YYYY-MM-DD */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function listDates(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function mergeStatusCounts(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = (out[k] ?? 0) + b[k];
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
//  POST handler — routes by action
// ────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentEmployee();
    if (!me) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action as 'start' | 'batch' | 'finish';

    if (action === 'start')  return handleStart(body, me);
    if (action === 'batch')  return handleBatch(body, me);
    if (action === 'finish') return handleFinish(body, me);

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('reprocess-attendance error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────
//  START — validate, resolve scope to concrete employee_ids, create run row
// ────────────────────────────────────────────────────────────────────────
async function handleStart(body: any, me: any) {
  const { dateFrom, dateTo, scopeType, categoryIds, employeeIds, triggerReason } = body;

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: 'dateFrom must be on or before dateTo' }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (dateTo > today) {
    return NextResponse.json({ error: 'Cannot reprocess future dates' }, { status: 400 });
  }
  if (!['all', 'category', 'employees'].includes(scopeType)) {
    return NextResponse.json({ error: 'scopeType must be all|category|employees' }, { status: 400 });
  }

  const dates = listDates(dateFrom, dateTo);
  if (dates.length > MAX_DATE_RANGE_DAYS) {
    return NextResponse.json({
      error: `Range exceeds ${MAX_DATE_RANGE_DAYS}-day cap (${dates.length} days requested)`,
    }, { status: 400 });
  }

  const supabase = adminClient();

  // Resolve scope → concrete list of employee_ids
  let resolvedEmployeeIds: string[] = [];

  if (scopeType === 'all') {
    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('status', 'Active');
    resolvedEmployeeIds = (data ?? []).map(e => e.id);
  } else if (scopeType === 'category') {
    if (!categoryIds || categoryIds.length === 0) {
      return NextResponse.json({ error: 'categoryIds required for category scope' }, { status: 400 });
    }
    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('status', 'Active')
      .in('category_id', categoryIds);
    resolvedEmployeeIds = (data ?? []).map(e => e.id);
  } else if (scopeType === 'employees') {
    if (!employeeIds || employeeIds.length === 0) {
      return NextResponse.json({ error: 'employeeIds required for employees scope' }, { status: 400 });
    }
    resolvedEmployeeIds = employeeIds;
  }

  if (resolvedEmployeeIds.length === 0) {
    return NextResponse.json({ error: 'No employees matched the scope' }, { status: 400 });
  }

  const totalExpected = dates.length * resolvedEmployeeIds.length;

  // Create the run row
  const { data: run, error: runErr } = await supabase
    .from('reprocess_runs')
    .insert({
      status: 'running',
      date_from: dateFrom,
      date_to: dateTo,
      scope_type: scopeType,
      category_ids: scopeType === 'category' ? categoryIds : null,
      employee_ids: resolvedEmployeeIds,
      date_count: dates.length,
      employee_count: resolvedEmployeeIds.length,
      total_rows_expected: totalExpected,
      triggered_by: me.id,
      triggered_by_name: `${me.first_name} ${me.last_name}`,
      trigger_reason: triggerReason || null,
      status_before: {},
      status_after: {},
    })
    .select('id')
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message || 'Failed to create run' }, { status: 500 });
  }

  return NextResponse.json({
    runId: run.id,
    dates,
    employeeCount: resolvedEmployeeIds.length,
    totalExpected,
  });
}

// ────────────────────────────────────────────────────────────────────────
//  BATCH — process one date for the scope
// ────────────────────────────────────────────────────────────────────────
async function handleBatch(body: any, me: any) {
  const { runId, date } = body;
  if (!runId || !date) {
    return NextResponse.json({ error: 'runId and date are required' }, { status: 400 });
  }

  const supabase = adminClient();

  // Load the run row
  const { data: run, error: loadErr } = await supabase
    .from('reprocess_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (loadErr || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  if (run.status !== 'running') {
    return NextResponse.json({ error: `Run is ${run.status}, cannot process batches` }, { status: 400 });
  }

  // Validate date is in the run's scope
  if (date < run.date_from || date > run.date_to) {
    return NextResponse.json({ error: 'Date outside run range' }, { status: 400 });
  }

  const t0 = Date.now();

  // Process — always preserves manually-corrected rows (no UI override)
  const result = await processDateAttendance(date, {
    employeeIds: run.employee_ids,
    preserveManuallyCorrected: true,
  });

  const elapsed = Date.now() - t0;

  // Update the run row's progress + diff
  const newDatesProcessed = (run.dates_processed ?? 0) + 1;
  const newRowsProcessed = (run.rows_processed ?? 0) + result.processed;
  const newRowsSkipped = (run.rows_skipped ?? 0) + result.skipped;
  const newErrors = result.errors.length > 0
    ? [...(run.errors ?? []), { date, errors: result.errors }]
    : run.errors;

  // statusBefore — only set on first batch
  const isFirstBatch = (run.dates_processed ?? 0) === 0;
  const newStatusBefore = isFirstBatch
    ? result.statusBefore
    : mergeStatusCounts(run.status_before ?? {}, result.statusBefore);
  const newStatusAfter = mergeStatusCounts(run.status_after ?? {}, result.statusAfter);

  await supabase
    .from('reprocess_runs')
    .update({
      dates_processed: newDatesProcessed,
      rows_processed: newRowsProcessed,
      rows_skipped: newRowsSkipped,
      errors: newErrors,
      status_before: newStatusBefore,
      status_after: newStatusAfter,
    })
    .eq('id', runId);

  return NextResponse.json({
    date,
    processed: result.processed,
    skipped: result.skipped,
    errors: result.errors,
    statusBefore: result.statusBefore,
    statusAfter: result.statusAfter,
    durationMs: elapsed,
    // Running totals
    runTotals: {
      datesProcessed: newDatesProcessed,
      datesTotal: run.date_count,
      rowsProcessed: newRowsProcessed,
      rowsSkipped: newRowsSkipped,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────
//  FINISH — mark run complete (or cancelled/failed)
// ────────────────────────────────────────────────────────────────────────
async function handleFinish(body: any, me: any) {
  const { runId, finalStatus } = body;
  if (!runId) {
    return NextResponse.json({ error: 'runId required' }, { status: 400 });
  }

  const status = finalStatus ?? 'completed';
  if (!['completed', 'failed', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid finalStatus' }, { status: 400 });
  }

  const supabase = adminClient();

  const { data: run } = await supabase
    .from('reprocess_runs')
    .select('started_at')
    .eq('id', runId)
    .single();

  const durationMs = run
    ? Date.now() - new Date(run.started_at).getTime()
    : null;

  await supabase
    .from('reprocess_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    })
    .eq('id', runId);

  return NextResponse.json({ ok: true, runId, status, durationMs });
}
