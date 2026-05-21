import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createEmployee } from '../actions';
import EmployeeForm from '@/components/employees/employee-form';

export default async function NewEmployeePage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  const [{ data: shifts }, { data: managers }] = await Promise.all([
    supabase.from('shifts').select('*').order('name'),
    supabase.from('employees').select('id, first_name, last_name, employee_no').eq('status','Active').order('employee_no'),
  ]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">New Employee</h1>
        <p className="text-sm text-gray-500 mt-0.5">Employee No. will be auto-assigned (CF-001 format)</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6">
        <EmployeeForm action={createEmployee} shifts={shifts ?? []} managers={managers ?? []}/>
      </div>
    </div>
  );
}
