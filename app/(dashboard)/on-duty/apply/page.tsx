
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

export default function ApplyOnDutyPage() {
  const router = useRouter();
  const [empId, setEmpId] = useState('');
  const [form, setForm]   = useState({
    date: new Date().toISOString().split('T')[0], timeOut: '', timeInPlanned: '',
    purpose: '', locationToVisit: '', vehicleType: 'Personal', vehicleNumber: '',
    outwardKm: '', projectSite: '',
  });
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
    e.preventDefault(); setLoading(true);
    const res = await fetch('/api/on-duty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, ...form, outwardKm: form.outwardKm ? Number(form.outwardKm) : null }),
    });
    if ((await res.json()).success) router.push('/on-duty');
    else setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>
      <h1 className="text-2xl font-semibold mb-6">On Duty Request</h1>
      <p className="text-sm text-gray-500 mb-6">For official company work outside factory. Must be approved before leaving. Security will verify the pass.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: 'Date', key: 'date', type: 'date' },
          { label: 'Time Out', key: 'timeOut', type: 'time' },
          { label: 'Expected Return', key: 'timeInPlanned', type: 'time' },
          { label: 'Location to Visit', key: 'locationToVisit', type: 'text', placeholder: 'Destination address' },
          { label: 'Purpose', key: 'purpose', type: 'text', placeholder: 'Reason for official visit' },
          { label: 'Project Site (optional)', key: 'projectSite', type: 'text', placeholder: 'If visiting a project site' },
          { label: 'Odometer (Outward KM)', key: 'outwardKm', type: 'number', placeholder: 'Odometer reading at departure' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input type={type} value={(form as any)[key]} placeholder={placeholder}
              onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
              className="w-full border rounded-lg p-2.5 text-sm"
              required={['date','timeOut','locationToVisit','purpose'].includes(key)} />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label>
          <div className="flex gap-2">
            {['Personal','Company'].map(v => (
              <button type="button" key={v} onClick={() => setForm(f => ({...f, vehicleType: v}))}
                className={`flex-1 py-2 rounded-lg border text-sm ${form.vehicleType === v ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>{v}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
          <input type="text" value={form.vehicleNumber} placeholder="GJ-01-AB-1234"
            onChange={e => setForm(f => ({...f, vehicleNumber: e.target.value}))}
            className="w-full border rounded-lg p-2.5 text-sm" />
        </div>
        <button type="submit" disabled={loading} className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60">
          {loading ? 'Submitting...' : 'Submit On Duty Request'}
        </button>
      </form>
    </div>
  );
}
