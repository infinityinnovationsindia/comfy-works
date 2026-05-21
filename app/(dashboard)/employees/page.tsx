import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { fmtDate } from '@/lib/utils';
import { UserPlus, Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

const STATUS_DOT: Record<string,string> = {
  Active:'bg-green-400', Inactive:'bg-gray-300', Resigned:'bg-yellow-400', Terminated:'bg-red-400'
};

export default async function EmployeesPage({ searchParams }: { searchParams: { q?: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  let query = supabase.from('employees')
    .select('id, employee_no, first_name, last_name, designation, department, location, employment_type, status, date_of_joining, shifts(name)')
    .order('employee_no');

  if (searchParams.q) {
    query = query.or(`first_name.ilike.%${searchParams.q}%,last_name.ilike.%${searchParams.q}%,employee_no.ilike.%${searchParams.q}%,department.ilike.%${searchParams.q}%`);
  }

  const { data: employees } = await query;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees?.length ?? 0} records</p>
        </div>
        <Link href="/employees/new"
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
          <UserPlus size={16}/> New Employee
        </Link>
      </div>

      {/* Search */}
      <form className="mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input name="q" defaultValue={searchParams.q} placeholder="Search name, ID, department…"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
      </form>

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
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No employees yet. <Link href="/employees/new" className="text-brand-500 underline">Add first employee →</Link>
                </td></tr>
              )}
              {(employees ?? []).map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs text-gray-400">{emp.employee_no} · {(emp as Record<string,unknown> & { shifts?: { name: string } | null }).shifts?.name ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">{emp.designation ?? '—'}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-gray-600">{emp.department ?? '—'}</span>
                    <span className="mx-1 text-gray-300">·</span>
                    <span className="text-xs text-gray-500">{emp.location ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-xs">{fmtDate(emp.date_of_joining)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[emp.status] ?? 'bg-gray-300'}`}/>
                      <span className="text-xs text-gray-600">{emp.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/employees/${emp.id}`} className="text-xs text-brand-500 hover:underline font-medium">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
