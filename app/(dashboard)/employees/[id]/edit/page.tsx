import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { updateEmployee } from '../../actions';
import EmployeeForm from '@/components/employees/employee-form';

export default async function EditEmployeePage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const [{ data: emp }, { data: shifts }, { data: managers }] = await Promise.all([
    supabase.from('employees').select('*').eq('id', params.id).single(),
    supabase.from('shifts').select('*').order('name'),
    supabase.from('employees').select('id, first_name, last_name, employee_no').eq('status','Active').neq('id', params.id).order('employee_no'),
  ]);

  if (!emp) notFound();

  const action = updateEmployee.bind(null, params.id);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Edit — {emp.first_name} {emp.last_name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{emp.employee_no}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6">
        <EmployeeForm action={action} initial={emp} shifts={shifts ?? []} managers={managers ?? []}/>
      </div>
    </div>
  );
}
