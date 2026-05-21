import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { addHoliday, deleteHoliday } from './actions';

export const dynamic = 'force-dynamic';

const TYPE_COLOR: Record<string, string> = {
  Sunday:   'bg-gray-100 text-gray-600 border-gray-200',
  AMAS:     'bg-orange-100 text-orange-700 border-orange-200',
  National: 'bg-blue-100 text-blue-700 border-blue-200',
  Festival: 'bg-purple-100 text-purple-700 border-purple-200',
  Other:    'bg-green-100 text-green-700 border-green-200',
};

const TYPE_DOT: Record<string, string> = {
  Sunday: 'bg-gray-400', AMAS: 'bg-orange-400',
  National: 'bg-blue-500', Festival: 'bg-purple-500', Other: 'bg-green-500',
};

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// Sort key: financial year order (Apr=0, May=1, ... Mar=11)
function fySort(year: number, month: number): number {
  // month is 0-indexed (0=Jan, 3=Apr, 11=Dec)
  const fyMonth = month >= 3 ? month - 3 : month + 9; // Apr=0, May=1 ... Mar=11
  const fyYear  = month >= 3 ? year : year - 1;
  return fyYear * 100 + fyMonth;
}

function groupByMonth(holidays: { id:string; date:string; name:string; type:string|null }[]) {
  const map: Record<string, { year:number; month:number; items: typeof holidays }> = {};
  holidays.forEach(h => {
    const d = new Date(h.date + 'T00:00:00');
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const key = `${yr}-${String(mo).padStart(2,'0')}`;
    if (!map[key]) map[key] = { year: yr, month: mo, items: [] };
    map[key].items.push(h);
  });
  return map;
}

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

  const grouped = groupByMonth(holidays ?? []);

  // Sort in financial year order: Apr 2026 → May → ... → Dec 2026 → Jan 2027 → ... → Mar 2027
  const sortedMonths = Object.entries(grouped)
    .sort(([, a], [, b]) => fySort(a.year, a.month) - fySort(b.year, b.month));

  const inp = "h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full bg-white";

  const counts: Record<string, number> = {};
  (holidays ?? []).forEach(h => {
    const t = h.type ?? 'Other';
    counts[t] = (counts[t] ?? 0) + 1;
  });

  // Type display order for legend
  const legendOrder = ['Festival','National','AMAS','Sunday'];

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Holiday Calendars</h1>
          <p className="text-sm text-gray-500 mt-0.5">Financial Year 2026–27 · {holidays?.length ?? 0} holidays</p>
        </div>
        <div className="flex gap-2">
          {['Factory','Showroom'].map(c => (
            <a key={c} href={`/holidays?cal=${c}`}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                cal===c ? 'bg-brand-500 text-white shadow-sm' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {c}
            </a>
          ))}
        </div>
      </div>

      {/* Add holiday — TOP */}
      <div className="bg-white rounded-xl border border-brand-200 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          Add Holiday to {cal} Calendar
        </h2>
        <form action={addHoliday} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
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
              <option value="Festival">Festival</option>
              <option value="National">National Holiday</option>
              <option value="AMAS">AMAS</option>
              <option value="Sunday">Sunday</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <button type="submit" className="h-10 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold transition-colors">
            Add Holiday
          </button>
        </form>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-5">
        {legendOrder.filter(t => counts[t]).map(type => (
          <div key={type} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOT[type] ?? 'bg-gray-400'}`}/>
            <span className="text-xs font-medium text-gray-600">{type}</span>
            <span className="text-xs text-gray-400">{counts[type]}</span>
          </div>
        ))}
      </div>

      {/* Month cards — FY order: Apr 2026 → Mar 2027 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedMonths.map(([key, { year, month, items }]) => {
          const nonSundays = items.filter(h => h.type !== 'Sunday');
          const sundays    = items.filter(h => h.type === 'Sunday');
          // Sort non-sundays: Festivals/National first, then AMAS, by date
          const sorted = [...nonSundays].sort((a,b) => a.date.localeCompare(b.date));

          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Month header */}
              <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">{MONTHS[month]}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{year}</span>
                </div>
                <div className="flex items-center gap-2">
                  {nonSundays.length > 0 && (
                    <span className="text-xs font-medium text-brand-600">{nonSundays.length} named</span>
                  )}
                  <span className="text-xs text-gray-400">{items.length} total</span>
                </div>
              </div>

              <div className="p-3">
                {/* Named holidays */}
                {sorted.length > 0 ? (
                  <div className="space-y-1.5 mb-2">
                    {sorted.map(h => {
                      const d = new Date(h.date + 'T00:00:00');
                      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
                      return (
                        <div key={h.id} className="flex items-center gap-2.5 group py-0.5">
                          <div className="w-11 text-right flex-shrink-0">
                            <span className="text-lg font-bold text-gray-800 leading-none">{d.getDate()}</span>
                            <span className="text-[10px] text-gray-400 ml-1">{dayName}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 font-medium truncate">{h.name}</p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${TYPE_COLOR[h.type ?? 'Other'] ?? TYPE_COLOR['Other']}`}>
                            {h.type ?? 'Other'}
                          </span>
                          <form action={deleteHoliday.bind(null, h.id)} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button type="submit" title="Remove" className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-1">No named holidays</p>
                )}

                {/* Sundays compact row */}
                {sundays.length > 0 && (
                  <div className={`flex flex-wrap items-center gap-1.5 ${sorted.length > 0 ? 'pt-2 mt-1 border-t border-gray-100' : ''}`}>
                    <span className="text-[10px] text-gray-400 font-medium">Sundays:</span>
                    {sundays.map(h => {
                      const d = new Date(h.date + 'T00:00:00');
                      return (
                        <span key={h.id} className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                          {d.getDate()}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(!holidays || holidays.length === 0) && (
        <div className="text-center py-16 text-gray-400">
          <p>No holidays loaded yet. Add one above.</p>
        </div>
      )}
    </div>
  );
}
