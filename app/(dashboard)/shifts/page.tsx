import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { upsertShift } from './actions';

export const dynamic = 'force-dynamic';

async function ShiftForm({ initial }: { initial?: Record<string,string> }) {
  'use server'; // this is a server component, form uses server action
  return null; // rendered below as client-safe form
}

function InlineForm({ action, initial }: {
  action: (prev: unknown, fd: FormData) => Promise<{ error?: string }|void>;
  initial?: { id: string; name: string; start_time: string; end_time: string; location: string|null; notes: string|null };
}) {
  // We expose this as a plain HTML form (no client needed for simple forms)
  return null; // placeholder — actual form below
}

export default async function ShiftsPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  const { data: shifts } = await supabase.from('shifts').select('*').order('name');

  const inp = "h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Shift Groups</h1>
        <p className="text-sm text-gray-500 mt-0.5">Admin configurable — changes apply immediately to all employees on that shift</p>
      </div>

      {/* Existing shifts */}
      <div className="space-y-3 mb-8">
        {(shifts ?? []).map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                <code className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{s.id}</code>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {s.start_time} – {s.end_time}
                {s.location && <span className="ml-2 text-gray-400">· {s.location}</span>}
                {s.notes && <span className="ml-2 text-gray-400">· {s.notes}</span>}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Add new shift */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Add New Shift</h2>
        <form action={upsertShift} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Shift ID <span className="text-red-500">*</span></label>
              <input name="shift_id" placeholder="e.g. SHIFT_NIGHT" required className={inp}/>
              <p className="text-[10px] text-gray-400">Uppercase letters and underscores only</p>
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
              <input name="notes" className={inp} placeholder="Optional description"/>
            </div>
          </div>
          <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            Add Shift
          </button>
        </form>
      </div>
    </div>
  );
}
