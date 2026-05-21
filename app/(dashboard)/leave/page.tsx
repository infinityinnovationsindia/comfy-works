
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  L1_Approved: 'bg-blue-100 text-blue-800',
  L2_Approved: 'bg-indigo-100 text-indigo-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  Cancelled: 'bg-gray-100 text-gray-600',
};

export default function LeavePage() {
  const [leaves, setLeaves]     = useState<any[]>([]);
  const [userId, setUserId]     = useState('');
  const [empId, setEmpId]       = useState('');
  const [role, setRole]         = useState('');
  const [filter, setFilter]     = useState('pending');
  const [loading, setLoading]   = useState(true);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      supabase.from('user_accounts').select('employee_id, role').eq('id', data.user.id).single()
        .then(({ data: ua }) => {
          if (ua) { setEmpId(ua.employee_id); setRole(ua.role); }
        });
    });
  }, []);

  useEffect(() => {
    if (!empId) return;
    const isAdmin = ['super_admin','production_head','design_head','project_head','accounts'].includes(role);
    const url = filter === 'mine'
      ? `/api/leave/pending?employeeId=${empId}`
      : isAdmin
        ? `/api/leave/pending?approverId=${empId}`
        : `/api/leave/pending?employeeId=${empId}`;

    setLoading(true);
    fetch(url).then(r => r.json()).then(d => { setLeaves(d); setLoading(false); });
  }, [empId, filter, role]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Leave Management</h1>
        <Link href="/leave/apply"
          className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + Apply Leave
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {['pending','mine'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${filter === f ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            {f === 'pending' ? 'Pending My Approval' : 'My Leaves'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No leave requests found.</div>
      ) : (
        <div className="space-y-3">
          {leaves.map(l => (
            <Link key={l.id} href={`/leave/${l.id}`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-400 transition cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {l.employee?.first_name} {l.employee?.last_name}
                      </span>
                      <span className="text-xs text-gray-500">{l.employee?.employee_no}</span>
                      {l.notice_violation && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded font-medium">NOTICE VIOLATION</span>
                      )}
                      {l.is_retroactive && (
                        <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded font-medium">RETROACTIVE</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">{l.leave_type}</span> ·{' '}
                      {l.date_from} {l.date_from !== l.date_to ? `→ ${l.date_to}` : ''} ·{' '}
                      {l.working_days_count ?? '?'} working day(s)
                    </div>
                    <div className="text-sm text-gray-500 mt-1 truncate max-w-lg">{l.reason}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[l.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {l.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
