import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function makeClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
}

async function getCallerRole(supabase: ReturnType<typeof makeClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: acc } = await supabase
    .from('user_accounts')
    .select('role, employee_id')
    .eq('id', user.id)
    .single();
  return acc;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = makeClient();

  const acc = await getCallerRole(supabase);
  if (!acc || acc.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Only Super Admin can set red mark overrides' },
      { status: 403 }
    );
  }

  const body = await request.json();
  // body: { threshold: number | null, reason: string | null }
  // If threshold === null → remove the override.

  const isRemoval = body.threshold == null;

  if (!isRemoval) {
    if (typeof body.threshold !== 'number' || body.threshold < 0 || body.threshold > 999) {
      return NextResponse.json({ error: 'Threshold must be 0–999' }, { status: 400 });
    }
  }

  // Fetch old values for audit log
  const { data: oldEmp } = await supabase
    .from('employees')
    .select('red_mark_threshold_override, red_mark_override_reason, red_mark_override_set_at, red_mark_override_set_by')
    .eq('id', params.id)
    .single();

  const update = isRemoval
    ? {
        red_mark_threshold_override: null,
        red_mark_override_reason: null,
        red_mark_override_set_at: null,
        red_mark_override_set_by: null,
      }
    : {
        red_mark_threshold_override: body.threshold,
        red_mark_override_reason: body.reason || null,
        red_mark_override_set_at: new Date().toISOString(),
        red_mark_override_set_by: acc.employee_id,
      };

  const { error } = await supabase
    .from('employees')
    .update(update)
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log entry
  await supabase.from('audit_log').insert({
    table_name: 'employees',
    record_id: params.id,
    action: isRemoval ? 'OVERRIDE_REMOVED' : 'OVERRIDE_SET',
    old_values: oldEmp ?? null,
    new_values: update,
    changed_by: acc.employee_id,
    reason: isRemoval
      ? 'Red mark override removed'
      : `Red mark override set to ${body.threshold}: ${body.reason || '(no reason given)'}`,
  });

  return NextResponse.json({ success: true });
}
