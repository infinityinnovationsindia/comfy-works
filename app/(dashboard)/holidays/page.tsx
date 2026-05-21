import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { addHoliday, deleteHoliday } from './actions';
import { fmtDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TYPE_COLOR: Record<string,string> = {
  Sunday:'bg-gray-100 text-gray-600', AMAS:'bg-orange-100 text-orange-700',
  National:'bg-blue-100 text-blue-700', Festival:'bg-purple-100 text-purple-700',
};

export default async function HolidaysPage({ searchParams }: { searchParams: { cal?: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const cal = searchParams.cal ?? 'Factory';
  const { data: holidays } = await supabase
    .from('holidays').select('*')
    .eq('calendar_type', cal)
    .order('date');

  const inp = "h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Holiday Calendars</h1>
          <p className="text-sm text-gray-500 mt-0.5">2026–27 · {holidays?.length ?? 0} holidays loaded</p>
        </div>
        <div className="flex gap-2">
          {['Factory','Showroom'].map(c => (
            <a key={c} href={`/holidays?cal=${c}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${cal===c ? 'bg-brand-500 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {c}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Holiday</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!holidays?.length && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">No holidays loaded yet.</td></tr>
              )}
              {(holidays ?? []).map(h => (
                <tr key={h.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap font-mono text-xs">{fmtDate(h.date)}</td>
                  <td className="px-4 py-2.5 text-gray-900">{h.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[h.type ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                      {h.type ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteHoliday.bind(null, h.id)}>
                      <button type="submit" className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add holiday */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Add Holiday to {cal} Calendar</h2>
        <form action={addHoliday} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="hidden" name="calendar_type" value={cal}/>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Date <span className="text-red-500">*</span></label>
            <input type="date" name="date" required className={inp}/>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Holiday Name <span className="text-red-500">*</span></label>
            <input name="name" placeholder="e.g. Holi" required className={inp}/>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Type</label>
            <select name="type" className={inp}>
              <option value="">— Select —</option>
              <option value="Sunday">Sunday</option>
              <option value="National">National Holiday</option>
              <option value="Festival">Festival</option>
              <option value="AMAS">AMAS</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full bg-brand-500 hover:bg-brand-600 text-white h-10 rounded-lg text-sm font-semibold transition-colors">
              Add Holiday
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
