
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-100 text-green-800',PL:'bg-teal-100 text-teal-800',
  HPL:'bg-teal-50 text-teal-700',UL:'bg-orange-100 text-orange-800',
  HUL:'bg-orange-50 text-orange-700',H:'bg-blue-100 text-blue-700',
  A:'bg-red-100 text-red-700',AAA:'bg-red-200 text-red-900',
  AA:'bg-red-100 text-red-800',HA:'bg-yellow-100 text-yellow-800',
  LC:'bg-yellow-50 text-yellow-700',EG:'bg-yellow-50 text-yellow-700',
  AAA_PENDING:'bg-gray-100 text-gray-500',
};

export default function AttendancePage() {
  const router = useRouter();
  const [tab, setTab]           = useState('today');
  const [todayRecs, setTodayRecs] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch]     = useState('');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (tab === 'today') {
      setLoading(true);
      fetch(`/api/attendance/monthly?month=${today.slice(0,7)}`)
        .then(r => r.json())
        .then(d => {
          setTodayRecs(d.filter((r: any) => r.date === today));
          setLoading(false);
        });
    }
  }, [tab, today]);

  async function runAttendanceNow() {
    setProcessing(true);
    const res  = await fetch('/api/cron/process-attendance', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date: today }) });
    const data = await res.json();
    alert(`Processed ${data.processed} employees. Errors: ${data.errors?.length ?? 0}`);
    setProcessing(false);
    fetch(`/api/attendance/monthly?month=${today.slice(0,7)}`)
      .then(r => r.json())
      .then(d => setTodayRecs(d.filter((r: any) => r.date === today)));
  }

  const filtered = search
    ? todayRecs.filter(r =>
        `${r.employee?.first_name} ${r.employee?.last_name} ${r.employee?.employee_no}`
          .toLowerCase().includes(search.toLowerCase()))
    : todayRecs;

  const stats = {
    P: filtered.filter(r => r.status === 'P').length,
    A: filtered.filter(r => ['A','AAA'].includes(r.status)).length,
    PL: filtered.filter(r => r.status === 'PL').length,
    H: filtered.filter(r => r.status === 'H').length,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <button onClick={runAttendanceNow} disabled={processing}
          className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
          {processing ? 'Processing...' : '▶ Process Today'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[['today','Today'],['weekly','Weekly'],['monthly','Monthly']].map(([key, label]) => (
          <button key={key}
            onClick={() => key !== 'today' ? router.push(`/attendance/${key}`) : setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Today stat cards */}
      {tab === 'today' && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label:'Present', count: stats.P, color:'text-green-700 bg-green-50 border-green-200' },
              { label:'Absent', count: stats.A, color:'text-red-700 bg-red-50 border-red-200' },
              { label:'On Leave', count: stats.PL, color:'text-teal-700 bg-teal-50 border-teal-200' },
              { label:'Holiday', count: stats.H, color:'text-blue-700 bg-blue-50 border-blue-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
                <div className="text-3xl font-bold">{s.count}</div>
                <div className="text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <input type="text" placeholder="Search employee..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="border rounded-lg px-4 py-2.5 text-sm w-full max-w-sm" />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : (
            <div className="bg-white border rounded-xl divide-y">
              {filtered.map(rec => (
                <Link key={rec.employee_id} href={`/attendance/${rec.employee_id}`}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {rec.employee?.first_name?.[0]}{rec.employee?.last_name?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{rec.employee?.first_name} {rec.employee?.last_name}</div>
                        <div className="text-xs text-gray-400">{rec.employee?.employee_no}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {rec.check_in && (
                        <span className="text-xs text-gray-500">
                          {new Date(rec.check_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[rec.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {rec.status}
                      </span>
                      {rec.red_marks_total > 0 && (
                        <span className="text-xs text-red-500">⚑ {rec.red_marks_total}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-12 text-center text-gray-400">
                  No records. Click "Process Today" to generate attendance.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
