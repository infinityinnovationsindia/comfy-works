
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string, string> = {
  PL: 'bg-green-100 text-green-800', HPL: 'bg-green-50 text-green-700',
  UL: 'bg-orange-100 text-orange-800', HUL: 'bg-orange-50 text-orange-700',
  LC: 'bg-yellow-100 text-yellow-800', EG: 'bg-yellow-100 text-yellow-800',
};

export default function ApplyLeavePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [form, setForm] = useState({
    leaveType: 'PL', halfDayType: '', dateFrom: '', dateTo: '',
    reason: '', outOfStation: false, outOfStationContact: '', outOfStationAddress: '',
  });
  const [sandwich, setSandwich] = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [converting, setConverting] = useState(false); // Edge case 1

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        supabase.from('user_accounts').select('employee_id').eq('id', data.user.id).single()
          .then(({ data: ua }) => {
            if (ua) {
              supabase.from('employees').select('*').eq('id', ua.employee_id).single()
                .then(({ data: emp }) => setEmployee(emp));
              fetch(`/api/leave/balance?employeeId=${ua.employee_id}`)
                .then(r => r.json()).then(setBalance);
            }
          });
      }
    });
  }, []);

  useEffect(() => {
    if (form.dateFrom && form.dateTo && employee && form.dateFrom <= form.dateTo) {
      fetch(`/api/leave/sandwich?from=${form.dateFrom}&to=${form.dateTo}&employeeId=${employee.id}`)
        .then(r => r.json()).then(setSandwich);
    }
  }, [form.dateFrom, form.dateTo, employee]);

  const isHalfDay = ['HPL','HUL'].includes(form.leaveType);
  const isFullDay = ['PL','UL'].includes(form.leaveType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    setLoading(true); setError('');

    const payload = {
      employeeId: employee.id,
      leaveType: form.leaveType,
      halfDayType: form.halfDayType || null,
      dateFrom: form.dateFrom,
      dateTo: isHalfDay ? form.dateFrom : form.dateTo,
      reason: form.reason,
      outOfStation: form.outOfStation,
      outOfStationContact: form.outOfStationContact,
      outOfStationAddress: form.outOfStationAddress,
      convertFromPL: converting,
    };

    const res  = await fetch('/api/leave/apply', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();

    if (data.error === 'INSUFFICIENT_PL') {
      setError(data.message);
      setConverting(true);
      setLoading(false);
      return;
    }
    if (data.error === 'PROBATIONER_PL_BLOCKED') {
      setError(data.message);
      setLoading(false);
      return;
    }
    if (data.error) {
      setError(data.error);
      setLoading(false);
      return;
    }

    router.push(`/leave/${data.leaveId}?applied=true`);
  }

  if (!employee) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const plBalance = balance?.pl_balance ?? 0;
  const plNeeded  = sandwich?.plToDeduct ?? 0;
  const noticeViolation = form.dateFrom && ['PL','UL'].includes(form.leaveType)
    ? (new Date(form.dateFrom).getTime() - Date.now()) / (1000*60*60*24) < 3
    : false;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Apply for Leave</h1>

      {/* PL Balance */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <div className="text-sm text-gray-600">Available PL Balance</div>
        <div className="text-3xl font-bold text-green-700">{plBalance} days</div>
      </div>

      {/* Edge case 2: Probationer warning */}
      {employee.employment_type === 'Probationer' && form.leaveType === 'PL' && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3 mb-4 text-sm text-amber-800">
          ⚠️ You are on probation. PL cannot be used — only Unpaid Leave (UL) is available.
        </div>
      )}

      {/* Notice violation warning */}
      {noticeViolation && form.dateFrom && (
        <div className="bg-red-50 border border-red-300 rounded p-3 mb-4 text-sm text-red-800">
          ⚠️ NOTICE VIOLATION: Full day leave should be applied at least 3 days in advance. Your request will be submitted with a notice violation flag visible to approvers.
        </div>
      )}

      {/* Edge case 1: Converting PL to UL */}
      {converting && (
        <div className="bg-orange-50 border border-orange-400 rounded p-4 mb-4">
          <p className="text-sm font-medium text-orange-900 mb-2">
            ⚠️ Insufficient PL balance. Convert to Unpaid Leave?
          </p>
          <p className="text-sm text-orange-800">
            This will result in <strong>{plNeeded} day(s) salary deduction</strong>.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setForm(f => ({ ...f, leaveType: 'UL' })); setConverting(false); setError(''); }}
              className="px-4 py-2 bg-orange-600 text-white rounded text-sm">
              Convert to UL
            </button>
            <button onClick={() => { setConverting(false); setError(''); }}
              className="px-4 py-2 border rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      {error && !converting && (
        <div className="bg-red-50 border border-red-300 text-red-800 rounded p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Leave type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
          <div className="grid grid-cols-3 gap-2">
            {['PL','HPL','UL','HUL','LC','EG'].map(t => (
              <button type="button" key={t}
                onClick={() => setForm(f => ({ ...f, leaveType: t, dateFrom: '', dateTo: '' }))}
                className={`p-2 rounded border text-sm font-medium ${form.leaveType === t ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {form.leaveType === 'PL' ? 'Paid Leave (full day, deducted from PL balance)' :
             form.leaveType === 'HPL' ? 'Half Paid Leave (0.5 day from PL balance)' :
             form.leaveType === 'UL' ? 'Unpaid Leave (full day salary deduction)' :
             form.leaveType === 'HUL' ? 'Half Unpaid Leave (half day salary deduction)' :
             form.leaveType === 'LC' ? 'Late Coming (red mark system — pre-approve to avoid red marks)' :
             'Early Going (red mark system — pre-approve to avoid red marks)'}
          </p>
        </div>

        {/* Half day selector */}
        {isHalfDay && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Which Half?</label>
            <div className="flex gap-3">
              {['First Half','Second Half'].map(h => (
                <button type="button" key={h}
                  onClick={() => setForm(f => ({ ...f, halfDayType: h }))}
                  className={`px-4 py-2 rounded border text-sm ${form.halfDayType === h ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date selection */}
        <div className={isHalfDay ? '' : 'grid grid-cols-2 gap-4'}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isHalfDay ? 'Date' : 'From Date'}
            </label>
            <input type="date" value={form.dateFrom}
              onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))}
              className="w-full border rounded-lg p-2.5 text-sm" required />
          </div>
          {!isHalfDay && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={form.dateTo} min={form.dateFrom}
                onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))}
                className="w-full border rounded-lg p-2.5 text-sm" required />
            </div>
          )}
        </div>

        {/* Sandwich rule preview */}
        {sandwich && form.dateFrom && !isHalfDay && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">📅 Sandwich Rule Calculation</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-800">{sandwich.totalCalendarDays}</div>
                <div className="text-blue-600 text-xs">Calendar Days</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-700">{sandwich.sandwichedHolidays.length}</div>
                <div className="text-orange-600 text-xs">Sandwiched</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold ${['PL','HPL'].includes(form.leaveType) ? 'text-red-700' : 'text-gray-700'}`}>
                  {['PL','HPL'].includes(form.leaveType) ? sandwich.plToDeduct : 0}
                </div>
                <div className="text-xs text-gray-600">PL to Deduct</div>
              </div>
            </div>
            {sandwich.sandwichedHolidays.length > 0 && (
              <p className="text-xs text-orange-800 mt-2">
                ⚠️ Includes: {sandwich.sandwichedHolidays.join(', ')} — these days count as leave under sandwich rule.
              </p>
            )}
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <textarea value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            className="w-full border rounded-lg p-2.5 text-sm" rows={3} required
            placeholder="Please provide a reason for your leave..." />
        </div>

        {/* Out of station */}
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.outOfStation}
              onChange={e => setForm(f => ({ ...f, outOfStation: e.target.checked }))}
              className="rounded" />
            Travelling out of station during leave?
          </label>
          {form.outOfStation && (
            <div className="mt-3 space-y-2">
              <input type="tel" placeholder="Contact number while away"
                value={form.outOfStationContact}
                onChange={e => setForm(f => ({ ...f, outOfStationContact: e.target.value }))}
                className="w-full border rounded-lg p-2.5 text-sm" />
              <input type="text" placeholder="Address while away"
                value={form.outOfStationAddress}
                onChange={e => setForm(f => ({ ...f, outOfStationAddress: e.target.value }))}
                className="w-full border rounded-lg p-2.5 text-sm" />
            </div>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
          {loading ? 'Submitting...' : 'Submit Leave Application'}
        </button>
      </form>
    </div>
  );
}
