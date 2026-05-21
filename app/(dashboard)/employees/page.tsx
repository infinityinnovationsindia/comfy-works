import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { fmtDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<string,string> = {
  Active:'bg-green-400', Inactive:'bg-gray-300',
  Resigned:'bg-yellow-400', Terminated:'bg-red-400'
};

export default async function EmployeesPage({ searchParams }: { searchParams: { q?: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  let query = supabase
    .from('employees')
    .select('id, employee_no, first_name, last_name, designation, department, location, employment_type, status, date_of_joining, shifts(name)')
    .order('employee_no');

  if (searchParams.q) {
    query = query.or(
      `first_name.ilike.%${searchParams.q}%,last_name.ilike.%${searchParams.q}%,employee_no.ilike.%${searchParams.q}%,department.ilike.%${searchParams.q}%`
    );
  }

  const { data: employees } = await query;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees?.length ?? 0} records</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Bulk Upload */}
          <Link href="/employees/bulk-upload"
            className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Bulk Upload
          </Link>
          {/* New Employee */}
          <Link href="/employees/new"
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/>
              <line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            New Employee
          </Link>
        </div>
      </div>

      {/* Search */}
      <form className="mb-4">
        <div className="relative max-w-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5"
            className="absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input name="q" defaultValue={searchParams.q}
            placeholder="Search name, ID, department…"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Employee</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Designation</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Location</th>
                <th className="px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Joined</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!employees?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    No employees yet.{' '}
                    <Link href="/employees/new" className="text-brand-500 underline">Add one manually</Link>
                    {' '}or{' '}
                    <Link href="/employees/bulk-upload" className="text-brand-500 underline">bulk upload from Excel</Link>.
                  </td>
                </tr>
              )}
              {(employees ?? []).map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {emp.employee_no}
                      {(emp as Record<string,unknown> & { shifts?: { name:string }|null }).shifts?.name
                        ? ` · ${(emp as Record<string,unknown> & { shifts?: { name:string }|null }).shifts!.name}`
                        : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">{emp.designation ?? '—'}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <p className="text-xs text-gray-700">{emp.department ?? '—'}</p>
                    <p className="text-xs text-gray-400">{emp.location ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">{fmtDate(emp.date_of_joining)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[emp.status] ?? 'bg-gray-300'}`}/>
                      <span className="text-xs text-gray-600">{emp.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/employees/${emp.id}`}
                      className="text-xs text-brand-500 hover:text-brand-700 font-medium hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(employees?.length ?? 0) > 0 && (
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-400">{employees?.length} employee{employees?.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
