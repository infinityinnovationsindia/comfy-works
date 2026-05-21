
/**
 * Approval token generation and verification.
 * Tokens are stored in leave_requests.approval_token
 * and expire after 7 days.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export function generateToken(): string {
  return randomUUID().replace(/-/g, '') + Date.now().toString(36);
}

export async function getLeaveByToken(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      employee:employee_id (first_name, last_name, employee_no, department, location),
      l1_approver:l1_approver_id (first_name, last_name),
      l2_approver:l2_approver_id (first_name, last_name),
      l3_approver:l3_approver_id (first_name, last_name)
    `)
    .eq('approval_token', token)
    .single();

  if (error || !data) return null;

  // Token valid for 7 days from creation
  const created = new Date(data.created_at);
  const now = new Date();
  if ((now.getTime() - created.getTime()) > 7 * 24 * 60 * 60 * 1000) return null;

  return data;
}
