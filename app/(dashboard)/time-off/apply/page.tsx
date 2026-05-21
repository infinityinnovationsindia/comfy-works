
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

export default function ApplyTimeOffPage() {
  const router  = useRouter();
  const [empId, setEmpId] = useState('');
  const [form, setForm]   = useState({ date: new Date().toISOString().split('T')[0], timeOut: '', timeInExpected: '', purpose: '' });
  const [loading, setLoading] = useState(false);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from('user_accounts').select('employee_id').eq('id', data.user.id).single()
        .then(({ data: ua }) => { if (ua) setEmpId(ua.employee_id); });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/time-off', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ employeeId: empId, ...form }),
    });
    if ((await res.json()).success) router.push('/time-off');
    else setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold mb-6">Request Time Off Permission</h1>
      <p className="text-sm text-gray-500 mb-6">For personal reasons during shift. Your supervisor will be notified for approval. Security will see the approved pass.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Out</label>
            <input type="time" value={form.timeOut} onChange={e => setForm(f => ({...f, timeOut: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Return</label>
            <input type="time" value={form.timeInExpected} onChange={e => setForm(f => ({...f, timeInExpected: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
          <textarea value={form.purpose} onChange={e => setForm(f => ({...f, purpose: e.target.value}))} className="w-full border rounded-lg p-2.5 text-sm" rows={3} required placeholder="Reason for leaving during shift..." />
        </div>
        <button type="submit" disabled={loading} className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}
