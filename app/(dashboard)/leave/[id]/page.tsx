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
  Pending:     'bg-yellow-100 text-yellow-700',
  L1_Approved: 'bg-blue-100 text-blue-700',
  L2_Approved: 'bg-blue-100 text-blue-700',
  Approved:    'bg-green-100 text-green-700',
  Rejected:    'bg-red-100 text-red-700',
  Cancelled:   'bg-gray-100 text-gray-600',
};

const STATUS_LABEL: Record<string, string> = {
  Pending:     'Pending',
  L1_Approved: 'L1 Approved',
  L2_Approved: 'L2 Approved',
  Approved:    'Approved ✓',
  Rejected:    'Rejected',
  Cancelled:   'Cancelled',
};

const TYPE_LABEL: Record<string, string> = {
  PL:  'Paid Leave',
  HPL: 'Half Paid Leave',
  UL:  'Unpaid Leave',
  HUL: 'Half Unpaid Leave',
  LC:  'Late Coming',
  EG:  'Early Going',
};

export default async function LeaveDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: lv } = await supabase
    .from('leave_requests')
    .select(`
      *,
      employee:employee_id ( id, employee_no, first_name, last_name, department ),
      l1:l1_approver_id ( id, first_name, last_name ),
      l2:l2_approver_id ( id, first_name, last_name ),
      rejecter:rejected_by ( id, first_name, last_name )
    `)
    .eq('id', params.id)
    .single();

  if (!lv) notFound();

  const emp = (lv as any).employee;
  const l1 = (lv as any).l1;
  const l2 = (lv as any).l2;
  const rejecter = (lv as any).rejecter;
  const typeLabel = TYPE_LABEL[lv.leave_type] || lv.leave_type;

  return (
    <div className="max-w-4xl space-y-4 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <Link href="/leave" className="text-xs text-gray-500 hover:underline">← Leave Management</Link>
        <div className="flex flex-wrap items-start justify-between gap-4 mt-1">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {typeLabel}
              {lv.half_day_type && <span className="text-base font-normal text-gray-500 ml-2">({lv.half_day_type})</span>}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {fmtDate(lv.date_from)}
              {lv.date_from !== lv.date_to && ` → ${fmtDate(lv.date_to)}`}
              <span className="mx-1.5 text-gray-400">·</span>
              <span className="font-medium text-gray-700">{lv.working_days_count} day{lv.working_days_count !== 1 ? 's' : ''}</span>
            </p>
            {emp && (
              <p className="text-xs text-gray-500 mt-1">
                {emp.first_name} {emp.last_name} · {emp.employee_no} · {emp.department || '—'}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[lv.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABEL[lv.status] || lv.status}
            </span>
            {lv.notice_violation && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Notice Violation</span>
            )}
            {lv.is_retroactive && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Retroactive</span>
            )}
          </div>
        </div>
      </div>

      <Section title="Leave Details">
        <Field label="Type" value={typeLabel} />
        <Field label="Half Day" value={lv.half_day_type} />
        <Field label="From" value={fmtDate(lv.date_from)} />
        <Field label="To" value={fmtDate(lv.date_to)} />
        <Field label="Working Days" value={lv.working_days_count} />
        <Field label="PL to Deduct" value={lv.pl_to_deduct} />
        <Field label="Applied On" value={fmtDate(lv.created_at)} />
        <Field label="Last Updated" value={lv.updated_at ? new Date(lv.updated_at).toLocaleString('en-IN') : null} />
      </Section>

      <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-100">Reason</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{lv.reason || '—'}</p>
      </div>

      {lv.out_of_station && (
        <Section title="Out of Station">
          <Field label="Contact Number" value={lv.out_of_station_contact} />
          <Field label="Address" value={lv.out_of_station_address} />
        </Section>
      )}

      {/* Approval Timeline */}
      <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white">
        <h3 className="text-sm font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Approval Timeline</h3>
        <div className="space-y-4">
          {/* L1 */}
          <div className="flex gap-3">
            <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${lv.l1_approved_at ? 'bg-green-500' : lv.status === 'Rejected' ? 'bg-red-500' : 'bg-gray-300'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Level 1 — {l1 ? `${l1.first_name} ${l1.last_name}` : 'Direct Supervisor'}
              </p>
              {lv.l1_approved_at ? (
                <p className="text-xs text-green-700 mt-0.5">
                  Approved · {new Date(lv.l1_approved_at).toLocaleString('en-IN')}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5">Pending</p>
              )}
              {lv.l1_comment && <p className="text-xs text-gray-600 mt-1 italic">"{lv.l1_comment}"</p>}
            </div>
          </div>

          {/* L2 */}
          <div className="flex gap-3">
            <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${lv.l2_approved_at ? 'bg-green-500' : lv.status === 'Rejected' ? 'bg-red-500' : 'bg-gray-300'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                Level 2 — {l2 ? `${l2.first_name} ${l2.last_name}` : 'Kush Patel'} (Final)
              </p>
              {lv.l2_approved_at ? (
                <p className="text-xs text-green-700 mt-0.5">
                  Approved · {new Date(lv.l2_approved_at).toLocaleString('en-IN')}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5">Pending L1</p>
              )}
              {lv.l2_comment && <p className="text-xs text-gray-600 mt-1 italic">"{lv.l2_comment}"</p>}
            </div>
          </div>

          {/* Rejection */}
          {lv.status === 'Rejected' && (
            <div className="flex gap-3 pt-3 border-t border-red-100">
              <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0 bg-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-700">
                  Rejected by {rejecter ? `${rejecter.first_name} ${rejecter.last_name}` : 'unknown'}
                </p>
                {lv.rejected_at && (
                  <p className="text-xs text-red-600 mt-0.5">
                    {new Date(lv.rejected_at).toLocaleString('en-IN')}
                  </p>
                )}
                {lv.rejection_reason && (
                  <p className="text-xs text-red-700 mt-1 bg-red-50 px-2 py-1 rounded">
                    {lv.rejection_reason}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {(lv.status === 'Pending' || lv.status === 'L1_Approved') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-amber-800">This request is awaiting approval.</p>
          <Link href="/approvals" className="text-sm font-medium text-amber-900 underline">
            Go to Approvals →
          </Link>
        </div>
      )}
    </div>
  );
}