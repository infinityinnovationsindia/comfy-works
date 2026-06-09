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
  Settled: 'bg-blue-100 text-blue-800',
};

export default async function PettyCashDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: pc } = await supabase
    .from('petty_cash_requests')
    .select(`
      *,
      employee:employee_id ( id, employee_no, first_name, last_name ),
      approver:approved_by ( id, employee_no, first_name, last_name )
    `)
    .eq('id', params.id)
    .single();

  if (!pc) notFound();

  const emp = (pc as any).employee;
  const approver = (pc as any).approver;
  const amount = pc.amount ? `₹${Number(pc.amount).toLocaleString('en-IN')}` : null;

  return (
    <div className="max-w-4xl space-y-4 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/petty-cash" className="text-xs text-gray-500 hover:underline">← Petty Cash</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{amount} — {pc.purpose || 'No purpose'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {emp ? `${emp.first_name} ${emp.last_name}` : '—'} · {pc.department || '—'} · {fmtDate(pc.created_at)}
          </p>
        </div>
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[pc.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {pc.status}
        </span>
      </div>

      <Section title="Request Details">
        <Field label="Amount" value={amount} />
        <Field label="Department" value={pc.department} />
        <Field label="Status" value={pc.status} />
        <Field
          label="Requested By"
          value={emp ? `${emp.first_name} ${emp.last_name} (${emp.employee_no})` : null}
        />
        <Field label="Requested On" value={fmtDate(pc.created_at)} />
        <Field
          label="Approved By"
          value={approver ? `${approver.first_name} ${approver.last_name}` : null}
        />
        <Field
          label="Approved At"
          value={pc.approved_at ? new Date(pc.approved_at).toLocaleString('en-IN') : null}
        />
        <Field
          label="Settled At"
          value={pc.settled_at ? new Date(pc.settled_at).toLocaleString('en-IN') : null}
        />
      </Section>

      <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-100">Purpose</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{pc.purpose || '—'}</p>
      </div>

      {pc.remarks && (
        <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-100">Remarks</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{pc.remarks}</p>
        </div>
      )}

      {pc.status === 'Pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          This request is pending approval from Kiran Patel & Neal Patel. Go to{' '}
          <Link href="/approvals" className="underline font-medium">Approvals</Link> to take action.
        </div>
      )}
    </div>
  );
}