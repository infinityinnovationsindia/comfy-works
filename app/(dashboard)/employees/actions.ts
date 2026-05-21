'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { calcProbationEnd, currentFY } from '@/lib/utils';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function nextNo(sb: ReturnType<typeof admin>): Promise<string> {
  const { data } = await sb.from('employees').select('employee_no').order('created_at', { ascending: false }).limit(1).single();
  if (!data) return 'CF-001';
  const n = parseInt(data.employee_no.replace('CF-',''), 10);
  return isNaN(n) ? 'CF-001' : `CF-${String(n+1).padStart(3,'0')}`;
}

function fd(formData: FormData) {
  const g  = (k: string) => (formData.get(k) as string|null) || null;
  const gn = (k: string) => { const v=g(k); return v ? parseFloat(v) : null; };
  return {
    first_name: (g('first_name')||'').trim(), middle_name: g('middle_name'), last_name: (g('last_name')||'').trim(),
    gender: g('gender'), date_of_birth: g('date_of_birth'), marital_status: g('marital_status'),
    caste: g('caste'), category: g('category'), sub_caste: g('sub_caste'),
    mother_tongue: g('mother_tongue'), nationality: g('nationality')||'Indian',
    email: g('email'), blood_group: g('blood_group'),
    weight_kg: gn('weight_kg'), height_cm: gn('height_cm'), birth_place: g('birth_place'),
    local_house_no: g('local_house_no'), local_street: g('local_street'), local_city: g('local_city'),
    local_district: g('local_district'), local_state: g('local_state'), local_pin: g('local_pin'),
    local_country: g('local_country')||'India', local_phone: g('local_phone'),
    perm_house_no: g('perm_house_no'), perm_street: g('perm_street'), perm_city: g('perm_city'),
    perm_district: g('perm_district'), perm_state: g('perm_state'), perm_pin: g('perm_pin'),
    perm_country: g('perm_country')||'India', perm_phone: g('perm_phone'),
    guardian_name: g('guardian_name'), guardian_mobile: g('guardian_mobile'),
    father_name: g('father_name'), father_mobile: g('father_mobile'), father_email: g('father_email'),
    father_occupation: g('father_occupation'), father_income: g('father_income'),
    mother_name: g('mother_name'), mother_mobile: g('mother_mobile'), mother_email: g('mother_email'),
    mother_occupation: g('mother_occupation'), mother_income: g('mother_income'),
    spouse_name: g('spouse_name'), spouse_mobile: g('spouse_mobile'), spouse_email: g('spouse_email'),
    spouse_occupation: g('spouse_occupation'), spouse_income: g('spouse_income'),
    pf_no: g('pf_no'), pan_no: g('pan_no'), aadhaar_no: g('aadhaar_no'),
    bank_account_no: g('bank_account_no'), voter_id: g('voter_id'),
    driving_licence_no: g('driving_licence_no'), driving_licence_expiry: g('driving_licence_expiry'),
    date_of_joining: g('date_of_joining')!, designation: g('designation'), department: g('department'),
    location: g('location'), shift_id: g('shift_id'),
    reporting_manager_id: g('reporting_manager_id') || null,
    employment_type: g('employment_type'), status: g('status')||'Active',
    owns_vehicle: formData.get('owns_vehicle') === 'on',
    vehicle_type: g('vehicle_type'), daily_salary_rate: gn('daily_salary_rate'),
  };
}

export async function createEmployee(_prev: unknown, formData: FormData) {
  const sb   = admin();
  const data = fd(formData);
  if (!data.first_name || !data.last_name || !data.date_of_joining)
    return { error: 'First name, last name and joining date are required.' };
  const employee_no        = await nextNo(sb);
  const probation_end_date = data.employment_type === 'Probationer' ? calcProbationEnd(data.date_of_joining) : null;
  const { data: emp, error } = await sb.from('employees').insert({ ...data, employee_no, probation_end_date }).select('id').single();
  if (error) return { error: error.message };
  await sb.from('leave_balances').insert({ employee_id: emp.id, financial_year: currentFY() });
  await sb.from('audit_log').insert({ table_name:'employees', record_id:emp.id, action:'INSERT', new_values:{ employee_no, ...data }, reason:'Onboarded via Comfy Works' });
  revalidatePath('/employees');
  redirect('/employees');
}

export async function updateEmployee(id: string, _prev: unknown, formData: FormData) {
  const sb   = admin();
  const data = fd(formData);
  if (!data.first_name || !data.last_name || !data.date_of_joining)
    return { error: 'First name, last name and joining date are required.' };
  const probation_end_date = data.employment_type === 'Probationer' ? calcProbationEnd(data.date_of_joining) : null;
  const { data: old } = await sb.from('employees').select('*').eq('id', id).single();
  const { error } = await sb.from('employees').update({ ...data, probation_end_date, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  await sb.from('audit_log').insert({ table_name:'employees', record_id:id, action:'UPDATE', old_values:old, new_values:data, reason:'Profile updated via Comfy Works' });
  revalidatePath('/employees');
  revalidatePath(`/employees/${id}`);
  redirect(`/employees/${id}`);
}

export async function setEmployeeStatus(id: string, status: string) {
  const sb = admin();
  await sb.from('employees').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  await sb.from('audit_log').insert({ table_name:'employees', record_id:id, action:'UPDATE', new_values:{ status }, reason:'Status changed via Comfy Works' });
  revalidatePath('/employees');
  revalidatePath(`/employees/${id}`);
}
