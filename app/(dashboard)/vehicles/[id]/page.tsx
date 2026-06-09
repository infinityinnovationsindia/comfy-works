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

export default async function VehicleTripDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: trip } = await supabase
    .from('vehicle_trips')
    .select(`
      *,
      approved_by_emp:employees!approved_by ( id, employee_no, first_name, last_name ),
      vehicle_trip_legs (
        id, destination, ref_no, remark,
        issued_by_emp:employees!issued_by ( id, employee_no, first_name, last_name ),
        accompanying:employees!accompanying_employee_id ( id, employee_no, first_name, last_name )
      )
    `)
    .eq('id', params.id)
    .single();

  if (!trip) notFound();

  const vehicleLabel = trip.vehicle === 'TATA_407' ? 'TATA 407' : 'Piaggio';
  const approvedBy = (trip as any).approved_by_emp;
  const legs = (trip as any).vehicle_trip_legs ?? [];
  const tripOpen = !trip.time_in;

  return (
    <div className="max-w-4xl space-y-4 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/vehicles" className="text-xs text-gray-500 hover:underline">← Vehicles</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1 flex items-center gap-2">
            {vehicleLabel}
            {tripOpen && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">OUT</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {fmtDate(trip.date)} · Out: {trip.time_out || '—'} · In: {trip.time_in || '—'} · {legs.length} stop{legs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Total KM</p>
          <p className="text-2xl font-bold text-green-700">{trip.total_km || 0}</p>
        </div>
      </div>

      <Section title="Trip Details">
        <Field label="Vehicle" value={vehicleLabel} />
        <Field label="Date" value={fmtDate(trip.date)} />
        <Field label="Time Out" value={trip.time_out} />
        <Field label="Time In" value={trip.time_in} />
        <Field label="Odometer Out" value={trip.odometer_out} />
        <Field label="Odometer In" value={trip.odometer_in} />
        <Field label="Total KM" value={trip.total_km} />
        <Field
          label="Approved By"
          value={approvedBy ? `${approvedBy.first_name} ${approvedBy.last_name}` : null}
        />
      </Section>

      <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white">
        <h3 className="text-sm font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
          Stops ({legs.length})
        </h3>
        {legs.length === 0 ? (
          <p className="text-sm text-gray-400">No stops logged.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {legs.map((leg: any, idx: number) => (
              <div key={leg.id} className="py-3">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium text-gray-900">
                    {idx + 1}. {leg.destination || '—'}
                  </p>
                  {leg.ref_no && <span className="text-xs text-gray-500">Ref: {leg.ref_no}</span>}
                </div>
                <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                  {leg.issued_by_emp && <p>Issued by: {leg.issued_by_emp.first_name} {leg.issued_by_emp.last_name}</p>}
                  {leg.accompanying && <p>Accompanying: {leg.accompanying.first_name} {leg.accompanying.last_name}</p>}
                  {leg.remark && <p>Remark: {leg.remark}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tripOpen && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Trip is still open (no inward time/odometer). Log the return on the list page or via the security gate dashboard.
        </div>
      )}
    </div>
  );
}