import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { upsertShift, deleteShift } from './actions';

export const dynamic = 'force-dynamic';

const LOC_COLOR: Record<string, string> = {
  Factory: 'bg-blue-100 text-blue-700',
  Showroom: 'bg-purple-100 text-purple-700',
  Site: 'bg-orange-100 text-orange-700',
};

export default async function ShiftsPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  const { data: shifts } = await supabase.from('shifts').select('*').order('name');

  const inp = "h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full bg-white";

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Shift Groups</h1>
        <p className="text-sm text-gray-500 mt-0.5">Admin configurable — changes apply to all employees on that shift immediately</p>
      </div>

      {/* Existing shifts */}
      <div className="space-y-3 mb-8">
        {(shifts ?? []).map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                    <code className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{s.id}</code>
                    {s.location && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LOC_COLOR[s.location] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.location}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 font-mono">
                    {s.start_time.slice(0,5)} → {s.end_time.slice(0,5)}
                    {s.notes && <span className="font-sans ml-2 text-gray-400 text-xs">· {s.notes}</span>}
                  </p>
                </div>
              </div>
              <form action={deleteShift.bind(null, s.id)}>
                <button type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors">
                  Delete
                </button>
              </form>
            </div>

            {/* Inline edit — using HTML details, works server-side */}
            <details className="border-t border-gray-100">
              <summary className="px-4 py-2 text-xs text-brand-600 cursor-pointer hover:bg-gray-50 font-medium list-none flex items-center gap-1.5 select-none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit this shift
              </summary>
              <form action={upsertShift} className="p-4 bg-gray-50 grid grid-cols-2 md:grid-cols-3 gap-3">
                <input type="hidden" name="id" value={s.id}/>
                <input type="hidden" name="shift_id" value={s.id}/>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Name</label>
                  <input name="name" defaultValue={s.name} required className={inp}/>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Start Time</label>
                  <input type="time" name="start_time" defaultValue={s.start_time} required className={inp}/>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">End Time</label>
                  <input type="time" name="end_time" defaultValue={s.end_time} required className={inp}/>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Location</label>
                  <select name="location" defaultValue={s.location ?? ''} className={inp}>
                    <option value="">— Any —</option>
                    <option value="Factory">Factory</option>
                    <option value="Showroom">Showroom</option>
                    <option value="Site">Site</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Notes</label>
                  <input name="notes" defaultValue={s.notes ?? ''} className={inp}/>
                </div>
                <div className="flex items-end">
                  <button type="submit" className="w-full bg-brand-500 hover:bg-brand-600 text-white h-10 rounded-lg text-sm font-semibold transition-colors">
                    Save Changes
                  </button>
                </div>
              </form>
            </details>
          </div>
        ))}
      </div>

      {/* Add new shift */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          Add New Shift
        </h2>
        <form action={upsertShift} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Shift ID <span className="text-red-500">*</span></label>
            <input name="shift_id" placeholder="e.g. SHIFT_NIGHT" required className={inp}/>
            <p className="text-[10px] text-gray-400">Uppercase + underscores only</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Shift Name <span className="text-red-500">*</span></label>
            <input name="name" placeholder="e.g. Night Shift" required className={inp}/>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Start Time <span className="text-red-500">*</span></label>
            <input type="time" name="start_time" required className={inp}/>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">End Time <span className="text-red-500">*</span></label>
            <input type="time" name="end_time" required className={inp}/>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Location</label>
            <select name="location" className={inp}>
              <option value="">— Any —</option>
              <option value="Factory">Factory</option>
              <option value="Showroom">Showroom</option>
              <option value="Site">Site</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Notes</label>
            <input name="notes" className={inp} placeholder="Optional"/>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              Add Shift
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
