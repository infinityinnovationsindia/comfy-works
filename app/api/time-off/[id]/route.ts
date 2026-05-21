
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { action, approverId } = await request.json();
  const supabase = db();

  const status = action === 'approve' ? 'Approved' : 'Rejected';
  await supabase.from('time_off_permissions').update({
    status,
    approved_by: approverId,
    approved_at: new Date().toISOString(),
  }).eq('id', params.id);

  return NextResponse.json({ success: true, status });
}
