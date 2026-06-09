import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fmtDate } from '@/lib/utils';

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 font-medium">{value ?? '—'}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white">
      <h3 className="text-sm font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">{children}</div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  Pending: 'bg-yellow-100 text-yellow-800',
};

function calcHours(from?: string | null, to?: string | null) {
  if (!from || !to) return null;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const diff = th * 60 + tm - (fh * 60 + fm);
  return diff > 0 ? (diff / 60).toFixed(1) + ' hrs' : null;
}

export default async function WorkPermissionDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: wp } = await supabase
    .from('work_permissions')
    .select(`
      *,
      raised_by_emp:employees!raised_by ( id, employee_no, first_name, last_name ),
      work_permission_employees (
        id, remark,
        employee:employees ( id, employee_no, first_name, last_name )
      )
    `)
    .eq('id', params.id)
    .single();

  if (!wp) notFound();

  const totalHours = calcHours(wp.time_from, wp.time_to);
  const raisedBy = (wp as any).raised_by_emp;
  const emps = (wp as any).work_permission_employees ?? [];

  return (
    <div className="max-w-4xl space-y-4 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/work-permission" className="text-xs text-gray-500 hover:underline">← Work Permission</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{wp.project_site || 'General Work'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {fmtDate(wp.date_of_work)} · {wp.time_from}–{wp.time_to}
            {totalHours && ` · ${totalHours}`}
          </p>
        </div>
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[wp.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {wp.status}
        </span>
      </div>

      <Section title="Permission Details">
        <Field label="Project Site" value={wp.project_site} />
        <Field label="Date of Work" value={fmtDate(wp.date_of_work)} />
        <Field label="Date Requested" value={fmtDate(wp.date_requested)} />
        <Field label="Time From" value={wp.time_from} />
        <Field label="Time To" value={wp.time_to} />
        <Field label="Total Hours" value={totalHours} />
        <Field label="SIP / PIP" value={wp.sip_pip} />
        <Field
          label="Raised By"
          value={raisedBy ? `${raisedBy.first_name} ${raisedBy.last_name} (${raisedBy.employee_no})` : null}
        />
        <Field
          label="Kush Approved At"
          value={wp.kush_approved_at ? new Date(wp.kush_approved_at).toLocaleString('en-IN') : null}
        />
      </Section>

      <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white">
        <h3 className="text-sm font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
          Employees ({emps.length})
        </h3>
        {emps.length === 0 ? (
          <p className="text-sm text-gray-400">No employees listed.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {emps.map((row: any) => (
              <div key={row.id} className="py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {row.employee?.first_name} {row.employee?.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{row.employee?.employee_no}</p>
                </div>
                <p className="text-xs text-gray-500">{row.remark || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {wp.status === 'Pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          This permission is pending approval. Go to <Link href="/approvals" className="underline font-medium">Approvals</Link> to approve or reject.
        </div>
      )}
    </div>
  );
}