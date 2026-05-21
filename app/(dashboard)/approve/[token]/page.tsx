
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ApprovePage() {
  const { token }  = useParams<{ token: string }>();
  const [leave, setLeave]   = useState<any>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [done, setDone]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch(`/api/approve/${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setLeave(d); });
  }, [token]);

  async function submit() {
    if (!action) return;
    setLoading(true);
    const res = await fetch(`/api/leave/${leave.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        approverId: action === 'approve' ? leave.l1_approver_id : leave.l1_approver_id,
        comment,
      }),
    });
    const data = await res.json();
    if (data.success) setDone(true);
    else { setError(data.error); setLoading(false); }
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-gray-700 font-medium">Invalid or expired link</div>
        <p className="text-gray-500 text-sm mt-2">This approval link has expired or already been used.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl mb-4">{action === 'approve' ? '✅' : '❌'}</div>
        <div className="text-xl font-semibold text-gray-900 mb-2">
          Leave {action === 'approve' ? 'Approved' : 'Rejected'}
        </div>
        <p className="text-gray-500 text-sm">The employee has been notified via WhatsApp.</p>
      </div>
    </div>
  );

  if (!leave) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        <div className="bg-green-700 text-white p-5">
          <div className="text-xs font-medium opacity-80 mb-1">COMFY WORKS — LEAVE APPROVAL</div>
          <div className="text-xl font-semibold">
            {leave.employee?.first_name} {leave.employee?.last_name}
          </div>
          <div className="text-sm opacity-80">{leave.employee?.employee_no} · {leave.employee?.department}</div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">Leave Type</div>
              <div className="font-semibold">{leave.leave_type}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">Days</div>
              <div className="font-semibold">{leave.working_days_count}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">From</div>
              <div className="font-semibold">{leave.date_from}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs mb-1">To</div>
              <div className="font-semibold">{leave.date_to}</div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="text-gray-500 text-xs mb-1">Reason</div>
            <div>{leave.reason}</div>
          </div>

          {leave.notice_violation && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              ⚠️ NOTICE VIOLATION — Applied less than 3 days in advance
            </div>
          )}
          {leave.is_retroactive && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
              📅 RETROACTIVE — Applied after leave date
            </div>
          )}

          <textarea value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Optional comment..."
            className="w-full border rounded-lg p-3 text-sm" rows={2} />

          <div className="flex gap-3">
            <button onClick={() => { setAction('approve'); setTimeout(submit, 0); }} disabled={loading}
              className="flex-1 py-3 bg-green-700 text-white rounded-xl font-semibold text-base disabled:opacity-60">
              ✓ Approve
            </button>
            <button onClick={() => { setAction('reject'); setTimeout(submit, 0); }} disabled={loading}
              className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-base disabled:opacity-60">
              ✗ Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
