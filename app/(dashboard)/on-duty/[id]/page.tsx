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

const STATUS_STYLE: Record<string, string> = {
  Pending:  'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Returned: 'bg-blue-100 text-blue-700',
};

export default async function OnDutyDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: od } = await supabase
    .from('on_duty_requests')
    .select(`
      *,
      employee:employee_id ( id, employee_no, first_name, last_name, department ),
      approver:approved_by ( id, first_name, last_name )
    `)
    .eq('id', params.id)
    .single();

  if (!od) notFound();

  const emp = (od as any).employee;
  const approver = (od as any).approver;
  const tripOpen = !od.time_in_actual && !od.inward_km;
  const computedKm = (od.outward_km && od.inward_km) ? Number(od.inward_km) - Number(od.outward_km) : od.total_km;

  return (
    <div className="max-w-4xl space-y-4 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <Link href="/on-duty" className="text-xs text-gray-500 hover:underline">← On Duty</Link>
        <div className="flex flex-wrap items-start justify-between gap-4 mt-1">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{od.location_to_visit || 'Official Movement'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {fmtDate(od.date)}
              {od.time_out && ` · Out ${od.time_out}`}
              {od.time_in_actual && ` · Returned ${od.time_in_actual}`}
            </p>
            {emp && (
              <p className="text-xs text-gray-500 mt-1">
                {emp.first_name} {emp.last_name} · {emp.employee_no} · {emp.department || '—'}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[od.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {od.status}
            </span>
            {tripOpen && od.status === 'Approved' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Trip Open</span>
            )}
          </div>
        </div>
      </div>

      <Section title="Trip Details">
        <Field label="Date" value={fmtDate(od.date)} />
        <Field label="Location to Visit" value={od.location_to_visit} />
        <Field label="Purpose" value={od.purpose} />
        <Field label="Project Site" value={od.project_site} />
        <Field label="Time Out" value={od.time_out} />
        <Field label="Time In (Planned)" value={od.time_in_planned} />
        <Field label="Time In (Actual)" value={od.time_in_actual} />
        <Field label="Applied On" value={fmtDate(od.created_at)} />
      </Section>

      <Section title="Vehicle & KM">
        <Field label="Vehicle Type" value={od.vehicle_type} />
        <Field label="Vehicle Number" value={od.vehicle_number} />
        <Field label="Outward KM" value={od.outward_km} />
        <Field label="Inward KM" value={od.inward_km} />
        <Field label="Total KM" value={computedKm} />
      </Section>

      <Section title="Approval & Security">
        <Field
          label="Approver"
          value={approver ? `${approver.first_name} ${approver.last_name}` : null}
        />
        <Field
          label="Approved At"
          value={od.approved_at ? new Date(od.approved_at).toLocaleString('en-IN') : null}
        />
        <Field
          label="Security Out"
          value={od.security_out_confirmed ? 'Confirmed' : 'Not confirmed'}
        />
        <Field
          label="Security In"
          value={od.security_in_confirmed ? 'Confirmed' : 'Not confirmed'}
        />
      </Section>

      {tripOpen && od.status === 'Approved' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Trip is approved but still open — inward time and inward KM haven't been logged yet. The employee or security can close this from the security gate dashboard when they return.
        </div>
      )}

      {od.status === 'Pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-amber-800">Awaiting approval.</p>
          <Link href="/approvals" className="text-sm font-medium text-amber-900 underline">
            Go to Approvals →
          </Link>
        </div>
      )}
    </div>
  );
}