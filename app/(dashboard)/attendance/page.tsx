import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fmtTime, todayIST, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${STATUS_COLORS[status] ?? STATUS_COLORS['—']}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center min-w-[72px]">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

export default async function AttendancePage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const today = todayIST();
  const dayStart = today + 'T00:00:00+05:30';
  const dayEnd   = today + 'T23:59:59+05:30';

  const [{ data: employees }, { data: attendance }, { data: punches }] = await Promise.all([
    supabase.from('employees')
      .select('id, employee_no, first_name, last_name, department, location, shift_id')
      .eq('status', 'Active').order('employee_no'),
    supabase.from('attendance_daily').select('*').eq('date', today),
    supabase.from('attendance_punches')
      .select('employee_id, punched_at, punch_type')
      .gte('punched_at', dayStart).lte('punched_at', dayEnd).order('punched_at'),
  ]);

  const attMap    = new Map((attendance ?? []).map(a => [a.employee_id, a]));
  const punchMap  = new Map<string, { punched_at: string; punch_type: string }[]>();
  (punches ?? []).forEach(p => {
    if (!punchMap.has(p.employee_id)) punchMap.set(p.employee_id, []);
    punchMap.get(p.employee_id)!.push(p);
  });

  const total   = (employees ?? []).length;
  const present = (attendance ?? []).filter(a => ['P','PL','HPL','H'].includes(a.status)).length;
  const late    = (attendance ?? []).filter(a => a.red_marks_morning > 0).length;
  const absent  = total - present;

  const nowIST = new Intl.DateTimeFormat('en-IN', {
    timeZone:'Asia/Kolkata', weekday:'long', day:'2-digit', month:'long', year:'numeric'
  }).format(new Date());

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Today's Attendance</h1>
          <p className="text-sm text-gray-500 mt-0.5">{nowIST}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <StatCard label="Present" value={present} color="text-brand-500"/>
          <StatCard label="Absent"  value={absent}  color="text-red-500"/>
          <StatCard label="Late"    value={late}    color="text-yellow-500"/>
          <StatCard label="Total"   value={total}   color="text-gray-700"/>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Employee</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Dept · Location</th>
                <th className="px-4 py-3 font-medium text-gray-500">In</th>
                <th className="px-4 py-3 font-medium text-gray-500">Out</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Red Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(employees ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No active employees yet. <a href="/employees/new" className="text-brand-500 underline">Add the first employee →</a>
                </td></tr>
              )}
              {(employees ?? []).map(emp => {
                const att   = attMap.get(emp.id);
                const emPunches = punchMap.get(emp.id) ?? [];
                const checkIn  = att?.check_in ?? emPunches[0]?.punched_at;
                const checkOut = att?.check_out ?? (emPunches.length > 1 ? emPunches[emPunches.length-1].punched_at : null);
                const status   = att?.status ?? (emPunches.length > 0 ? 'P' : '—');
                const redTotal = att?.red_marks_total ?? 0;
                return (
                  <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-400">{emp.employee_no}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-xs">
                      <span>{emp.department ?? '—'}</span>
                      <span className="text-gray-300 mx-1">·</span>
                      <span>{emp.location ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtTime(checkIn)}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtTime(checkOut)}</td>
                    <td className="px-4 py-3"><StatusBadge status={status}/></td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {redTotal > 0
                        ? <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{redTotal}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-400">{total} active employees · Biometric sync every 5 min · Dates in IST</p>
          </div>
        )}
      </div>
    </div>
  );
}
