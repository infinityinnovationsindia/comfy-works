
/**
 * Determines approval chain for a leave request.
 * Factory production workers: Supervisor → Shailoo → Kush (3-step)
 * Design (Yash's team): Yash → Kush (2-step)
 * Site (Pradeep/Luv): their manager → Kush (2-step)
 * Showroom: Kiran → Kush (2-step)
 */
import { createClient } from '@supabase/supabase-js';

export interface ApprovalChain {
  chainType: '2step' | '3step';
  l1ApproverId: string;
  l2ApproverId: string;
  l3ApproverId?: string; // Only for 3-step (Kush)
}

const PARTNER_EMPLOYEE_NOS = {
  kush:    'CF-004',
  shailoo: 'CF-002',
  yash:    'CF-003',
  pradeep: 'CF-012',
  luv:     'CF-005',
  kiran:   'CF-031',
  neal:    'CF-080',
};

export async function resolveApprovalChain(employeeId: string): Promise<ApprovalChain | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Load employee + all partner IDs
  const { data: emp } = await supabase
    .from('employees')
    .select('id, location, department, reporting_manager_id')
    .eq('id', employeeId)
    .single();

  if (!emp) return null;

  // Load partner employee UUIDs by CF number
  const { data: partners } = await supabase
    .from('employees')
    .select('id, employee_no')
    .in('employee_no', Object.values(PARTNER_EMPLOYEE_NOS));

  if (!partners) return null;

  const byNo = new Map(partners.map(p => [p.employee_no, p.id]));
  const kushId    = byNo.get(PARTNER_EMPLOYEE_NOS.kush)!;
  const shailooId = byNo.get(PARTNER_EMPLOYEE_NOS.shailoo)!;
  const yashId    = byNo.get(PARTNER_EMPLOYEE_NOS.yash)!;
  const pradeepId = byNo.get(PARTNER_EMPLOYEE_NOS.pradeep)!;
  const luvId     = byNo.get(PARTNER_EMPLOYEE_NOS.luv)!;
  const kiranId   = byNo.get(PARTNER_EMPLOYEE_NOS.kiran)!;

  const repMgr = emp.reporting_manager_id;

  // Design team (reports to Yash)
  if (repMgr === yashId) {
    return { chainType: '2step', l1ApproverId: yashId, l2ApproverId: kushId };
  }

  // Site staff (reports to Pradeep or Luv)
  if (repMgr === pradeepId || repMgr === luvId) {
    return { chainType: '2step', l1ApproverId: repMgr, l2ApproverId: kushId };
  }

  // Showroom staff
  if (emp.location === 'Showroom') {
    return { chainType: '2step', l1ApproverId: kiranId, l2ApproverId: kushId };
  }

  // Factory production workers (3-step)
  if (emp.location === 'Factory') {
    const supervisorId = repMgr || shailooId;
    // If reporting manager IS Shailoo, they go directly Shailoo → Kush (2-step)
    if (supervisorId === shailooId) {
      return { chainType: '2step', l1ApproverId: shailooId, l2ApproverId: kushId };
    }
    // Otherwise: supervisor → Shailoo → Kush
    return {
      chainType: '3step',
      l1ApproverId: supervisorId,
      l2ApproverId: shailooId,
      l3ApproverId: kushId,
    };
  }

  // Default fallback: reporting manager → Kush
  return {
    chainType: '2step',
    l1ApproverId: repMgr || kushId,
    l2ApproverId: kushId,
  };
}
