
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useParams, useRouter } from 'next/navigation';

export default function LeaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [leave, setLeave]     = useState<any>(null);
  const [empId, setEmpId]     = useState('');
  const [role, setRole]       = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  useEffect(() => {
    fetch(`/api/leave/${id}`).then(r => r.json()).then(setLeave);
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('user_accounts').select('employee_id,role').eq('id', data.user.id).single()
        .then(({ data: ua }) => { if (ua) { setEmpId(ua.employee_id); setRole(ua.role); } });
    });
  }, [id]);

  async function act(action: 'approve' | 'reject') {
    setLoading(true);
    const res = await fetch(`/api/leave/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, approverId: empId, comment }),
    });
    const data = await res.json();
    if (data.success) router.push('/leave');
    else { alert(data.error); setLoading(false); }
  }

  if (!leave) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const isMyTurn = (
    (leave.status === 'Pending'      && leave.l1_approver_id === empId) ||
    (leave.status === 'L1_Approved'  && leave.l2_approver_id === empId) ||
    (leave.status === 'L2_Approved'  && leave.l3_approver_id === empId)
  );

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold mb-6">Leave Application</h1>

      {/* Flags */}
      <div className="flex gap-2 mb-4">
        {leave.notice_violation && (
          <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">⚠️ NOTICE VIOLATION</span>
        )}
        {leave.is_retroactive && (
          <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">📅 RETROACTIVE APPLICATION</span>
        )}
      </div>

      <div className="bg-white border rounded-xl divide-y">
        <div className="p-4 grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Employee</span><div className="font-medium">{leave.employee?.first_name} {leave.employee?.last_name} ({leave.employee?.employee_no})</div></div>
          <div><span className="text-gray-500">Department</span><div>{leave.employee?.department}</div></div>
          <div><span className="text-gray-500">Leave Type</span><div className="font-medium">{leave.leave_type} {leave.half_day_type ? `(${leave.half_day_type})` : ''}</div></div>
          <div><span className="text-gray-500">Status</span><div className="font-medium">{leave.status}</div></div>
          <div><span className="text-gray-500">From</span><div>{leave.date_from}</div></div>
          <div><span className="text-gray-500">To</span><div>{leave.date_to}</div></div>
          <div><span className="text-gray-500">Working Days</span><div>{leave.working_days_count}</div></div>
          <div><span className="text-gray-500">PL to Deduct</span><div>{leave.pl_to_deduct}</div></div>
          <div className="col-span-2"><span className="text-gray-500">Reason</span><div>{leave.reason}</div></div>
          {leave.out_of_station && (
            <>
              <div><span className="text-gray-500">Out of Station Contact</span><div>{leave.out_of_station_contact}</div></div>
              <div><span className="text-gray-500">Address</span><div>{leave.out_of_station_address}</div></div>
            </>
          )}
        </div>

        {/* Approval chain status */}
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Approval Chain ({leave.chain_type})</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: 'L1', approver: leave.l1_approver, at: leave.l1_approved_at, comment: leave.l1_comment },
              { label: 'L2', approver: leave.l2_approver, at: leave.l2_approved_at, comment: leave.l2_comment },
              ...(leave.chain_type === '3step' ? [{ label: 'L3 (Kush)', approver: leave.l3_approver, at: leave.l3_approved_at, comment: leave.l3_comment }] : []),
            ].map(step => (
              <div key={step.label} className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${step.at ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                <span className="text-gray-600">{step.label}: {step.approver?.first_name} {step.approver?.last_name}</span>
                {step.at && <span className="text-green-600 text-xs">✓ {new Date(step.at).toLocaleDateString('en-IN')}</span>}
                {step.comment && <span className="text-gray-500 text-xs italic">"{step.comment}"</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons — only shown if it's this user's turn */}
        {isMyTurn && leave.status !== 'Approved' && leave.status !== 'Rejected' && (
          <div className="p-4">
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Optional comment..."
              className="w-full border rounded-lg p-2.5 text-sm mb-3" rows={2} />
            <div className="flex gap-3">
              <button onClick={() => act('approve')} disabled={loading}
                className="flex-1 py-2.5 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
                ✓ Approve
              </button>
              <button onClick={() => act('reject')} disabled={loading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium disabled:opacity-60">
                ✗ Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
