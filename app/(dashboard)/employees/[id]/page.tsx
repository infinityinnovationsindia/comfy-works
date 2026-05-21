import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fmtDate } from '@/lib/utils';
import { setEmployeeStatus } from '../actions';
import type { Employee } from '@/types/database';

function Field({ label, value }: { label: string; value: string|null|undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 font-medium">{value || '—'}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 md:p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">{children}</div>
    </div>
  );
}

const STATUS_COLOR: Record<string,string> = {
  Active:'bg-green-100 text-green-800', Inactive:'bg-gray-100 text-gray-700',
  Resigned:'bg-yellow-100 text-yellow-800', Terminated:'bg-red-100 text-red-800'
};

export default async function EmployeeViewPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: emp } = await supabase
    .from('employees')
    .select('*, shifts(*), reporting_manager:reporting_manager_id(id, first_name, last_name)')
    .eq('id', params.id).single();

  if (!emp) notFound();
  const e = emp as Employee & { shifts: { name:string; start_time:string; end_time:string }|null; reporting_manager: { first_name:string; last_name:string }|null };

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xl flex-shrink-0">
            {e.first_name[0]}{e.last_name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{e.first_name} {e.middle_name ? e.middle_name+' ' : ''}{e.last_name}</h1>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[e.status] ?? ''}`}>{e.status}</span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{e.employee_no} · {e.designation ?? 'No designation'} · {e.department ?? 'No department'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{e.employment_type} · Joined {fmtDate(e.date_of_joining)}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/employees/${e.id}/edit`}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Edit Profile
          </Link>
        </div>
      </div>

      {/* Employment */}
      <Section title="Employment">
        <Field label="Location"          value={e.location}/>
        <Field label="Shift"             value={e.shifts ? `${e.shifts.name} (${e.shifts.start_time}–${e.shifts.end_time})` : null}/>
        <Field label="Reporting Manager" value={e.reporting_manager ? `${e.reporting_manager.first_name} ${e.reporting_manager.last_name}` : null}/>
        <Field label="Employment Type"   value={e.employment_type}/>
        <Field label="Probation End"     value={fmtDate(e.probation_end_date)}/>
        <Field label="Date of Joining"   value={fmtDate(e.date_of_joining)}/>
      </Section>

      {/* Personal */}
      <Section title="Personal Information">
        <Field label="Gender"         value={e.gender === 'M' ? 'Male' : e.gender === 'F' ? 'Female' : null}/>
        <Field label="Date of Birth"  value={fmtDate(e.date_of_birth)}/>
        <Field label="Marital Status" value={e.marital_status}/>
        <Field label="Blood Group"    value={e.blood_group}/>
        <Field label="Mother Tongue"  value={e.mother_tongue}/>
        <Field label="Nationality"    value={e.nationality}/>
        <Field label="Email"          value={e.email}/>
        <Field label="Birth Place"    value={e.birth_place}/>
        <Field label="Weight"         value={e.weight_kg ? e.weight_kg+' kg' : null}/>
        <Field label="Height"         value={e.height_cm ? e.height_cm+' cm' : null}/>
        <Field label="Caste"          value={e.caste}/>
        <Field label="Category"       value={e.category}/>
      </Section>

      {/* Address */}
      <Section title="Address">
        <Field label="Local Address" value={[e.local_house_no, e.local_street, e.local_city, e.local_state, e.local_pin].filter(Boolean).join(', ')}/>
        <Field label="Local Phone"   value={e.local_phone}/>
        <Field label="Perm. Address" value={[e.perm_house_no, e.perm_street, e.perm_city, e.perm_state, e.perm_pin].filter(Boolean).join(', ')}/>
        <Field label="Perm. Phone"   value={e.perm_phone}/>
      </Section>

      {/* Family */}
      <Section title="Family Reference">
        <Field label="Guardian"        value={e.guardian_name ? `${e.guardian_name} · ${e.guardian_mobile ?? ''}` : null}/>
        <Field label="Father"          value={e.father_name ? `${e.father_name} · ${e.father_mobile ?? ''}` : null}/>
        <Field label="Mother"          value={e.mother_name ? `${e.mother_name} · ${e.mother_mobile ?? ''}` : null}/>
        <Field label="Spouse"          value={e.spouse_name ? `${e.spouse_name} · ${e.spouse_mobile ?? ''}` : null}/>
      </Section>

      {/* Identity — restricted notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        🔒 Identity documents (PAN, Aadhaar, Bank Account) are visible only to HR & Accounts. Manage in Edit Profile.
      </div>

      {/* Status actions */}
      {e.status === 'Active' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Status Actions</h3>
          <div className="flex gap-2 flex-wrap">
            <form action={setEmployeeStatus.bind(null, e.id, 'Inactive')}>
              <button type="submit" className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Mark Inactive</button>
            </form>
            <form action={setEmployeeStatus.bind(null, e.id, 'Resigned')}>
              <button type="submit" className="px-3 py-1.5 rounded-lg border border-yellow-300 text-sm text-yellow-700 hover:bg-yellow-50">Mark Resigned</button>
            </form>
            <form action={setEmployeeStatus.bind(null, e.id, 'Terminated')}>
              <button type="submit" className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-700 hover:bg-red-50">Mark Terminated</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
