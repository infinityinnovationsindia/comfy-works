
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-500',PL:'bg-teal-400',HPL:'bg-teal-300',
  UL:'bg-orange-400',HUL:'bg-orange-300',H:'bg-blue-300',
  A:'bg-red-400',AAA:'bg-red-600',AA:'bg-red-300',
  HA:'bg-yellow-400',LC:'bg-yellow-300',EG:'bg-yellow-200',
};

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export default function WeeklyAttendancePage() {
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(new Date()));
  const [records, setRecords]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().split('T')[0], day: d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric'}) };
  });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance/weekly?weekStart=${weekStart}`)
      .then(r => r.json()).then(d => { setRecords(d); setLoading(false); });
  }, [weekStart]);

  // Group by employee
  const byEmp = new Map<string, any>();
  records.forEach(r => {
    if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { employee: r.employee, days: {} });
    byEmp.get(r.employee_id).days[r.date] = r;
  });

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d.toISOString().split('T')[0]); }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d.toISOString().split('T')[0]); }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Weekly Attendance</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-3 py-2 border rounded-lg text-sm">←</button>
          <span className="text-sm font-medium px-3">{weekStart} → {weekDates[6].date}</span>
          <button onClick={nextWeek} className="px-3 py-2 border rounded-lg text-sm">→</button>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 w-48">Employee</th>
                {weekDates.map(d => (
                  <th key={d.date} className="px-2 py-3 text-center text-sm font-medium text-gray-600">{d.day}</th>
                ))}
                <th className="px-2 py-3 text-center text-sm font-medium text-gray-600">Red Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...byEmp.entries()].map(([empId, { employee, days }]) => {
                const weekRM = weekDates.reduce((s, d) => s + (days[d.date]?.red_marks_total ?? 0), 0);
                return (
                  <tr key={empId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/attendance/${empId}`} className="hover:text-green-700">
                        <div className="font-medium text-sm">{employee?.first_name} {employee?.last_name}</div>
                        <div className="text-xs text-gray-400">{employee?.employee_no}</div>
                      </Link>
                    </td>
                    {weekDates.map(d => {
                      const rec = days[d.date];
                      const status = rec?.status ?? '';
                      return (
                        <td key={d.date} className="px-2 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLORS[status] ?? 'bg-gray-200 text-gray-500'}`}>
                            {status || '—'}
                          </span>
                          {rec && (rec.red_marks_morning > 0 || rec.red_marks_evening > 0) && (
                            <div className="text-xs text-red-500 mt-0.5">
                              {rec.red_marks_morning > 0 && `M:${rec.red_marks_morning}`}
                              {rec.red_marks_evening > 0 && ` E:${rec.red_marks_evening}`}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-3 text-center">
                      <span className={`font-medium ${weekRM > 0 ? 'text-red-600' : 'text-gray-400'}`}>{weekRM || '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
