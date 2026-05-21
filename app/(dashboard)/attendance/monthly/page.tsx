
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-100 text-green-800', PL:'bg-teal-100 text-teal-800',
  HPL:'bg-teal-50 text-teal-700', UL:'bg-orange-100 text-orange-800',
  HUL:'bg-orange-50 text-orange-700', H:'bg-blue-100 text-blue-700',
  A:'bg-red-100 text-red-700', AAA:'bg-red-200 text-red-900 font-bold',
  AA:'bg-red-100 text-red-800', HA:'bg-yellow-100 text-yellow-800',
  LC:'bg-yellow-50 text-yellow-700', EG:'bg-yellow-50 text-yellow-700',
  AAA_PENDING:'bg-gray-100 text-gray-600',
};

export default function MonthlyAttendancePage() {
  const now = new Date();
  const [month, setMonth]       = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [records, setRecords]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance/monthly?month=${month}`)
      .then(r => r.json())
      .then(d => { setRecords(d); setLoading(false); });
  }, [month]);

  // Group by employee
  const byEmployee = new Map<string, any>();
  records.forEach(r => {
    const key = r.employee_id;
    if (!byEmployee.has(key)) byEmployee.set(key, { employee: r.employee, days: {} });
    byEmployee.get(key).days[r.date] = r;
  });

  // Get days in month
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, mon-1, i+1);
    return { date: `${month}-${String(i+1).padStart(2,'0')}`, dayNum: i+1, dayName: d.toLocaleDateString('en-IN',{weekday:'short'}) };
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Monthly Attendance</h1>
        <div className="flex items-center gap-3">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" />
          <a href={`/api/payroll/report?month=${month}`}
            className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
            Export Payroll (.xlsx)
          </a>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 bg-gray-50 border px-3 py-2 text-left text-sm font-medium min-w-[180px]">Employee</th>
                {dates.map(d => (
                  <th key={d.date} className={`border px-1 py-2 text-center min-w-[36px] ${d.dayName === 'Sun' ? 'bg-blue-50' : ''}`}>
                    <div>{d.dayNum}</div>
                    <div className="text-gray-400">{d.dayName}</div>
                  </th>
                ))}
                <th className="border px-2 py-2 text-center min-w-[60px]">P</th>
                <th className="border px-2 py-2 text-center min-w-[60px]">Abs</th>
                <th className="border px-2 py-2 text-center min-w-[60px]">PL</th>
                <th className="border px-2 py-2 text-center min-w-[60px]">RedMk</th>
              </tr>
            </thead>
            <tbody>
              {[...byEmployee.entries()].map(([empId, { employee, days }]) => {
                const totalP   = Object.values(days).filter((d: any) => ['P','LC','EG'].includes(d.status)).length;
                const totalAbs = Object.values(days).filter((d: any) => ['A','AAA','AA'].includes(d.status)).length;
                const totalPL  = Object.values(days).filter((d: any) => d.status === 'PL').length;
                const totalRM  = Object.values(days).reduce((s: number, d: any) => s + (d.red_marks_total ?? 0), 0);

                return (
                  <tr key={empId} className="hover:bg-gray-50">
                    <td className="sticky left-0 bg-white border px-3 py-2 font-medium">
                      <Link href={`/attendance/${empId}`} className="hover:text-green-700">
                        {employee?.first_name} {employee?.last_name}
                        <div className="text-gray-400 text-xs font-normal">{employee?.employee_no}</div>
                      </Link>
                    </td>
                    {dates.map(d => {
                      const rec = days[d.date];
                      return (
                        <td key={d.date} className="border p-0 text-center" title={rec?.status ?? ''}>
                          {rec ? (
                            <span className={`block text-center py-1 ${STATUS_COLORS[rec.status] ?? 'text-gray-300'}`}>
                              {rec.status === 'AAA_PENDING' ? '?' : rec.status}
                            </span>
                          ) : (
                            <span className="block py-1 text-gray-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border px-2 text-center font-medium text-green-800">{totalP}</td>
                    <td className="border px-2 text-center font-medium text-red-700">{totalAbs}</td>
                    <td className="border px-2 text-center">{totalPL}</td>
                    <td className="border px-2 text-center text-orange-700">{totalRM}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-4">
        {Object.entries(STATUS_COLORS).map(([code, cls]) => (
          <span key={code} className={`px-2 py-0.5 rounded text-xs ${cls}`}>{code}</span>
        ))}
      </div>
    </div>
  );
}
