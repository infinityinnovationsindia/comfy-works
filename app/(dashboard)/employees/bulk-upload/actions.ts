'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { calcProbationEnd, currentFY } from '@/lib/utils';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function parseDate(val: string | undefined): string | null {
  if (!val) return null;
  // Accepts DD/MM/YYYY or YYYY-MM-DD
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (y.length === 4) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

function norm(val: unknown): string | null {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  return String(val).trim();
}

function normBool(val: unknown): boolean {
  const s = String(val ?? '').toLowerCase().trim();
  return s === 'yes' || s === 'true' || s === '1';
}

function normNum(val: unknown): number | null {
  const n = parseFloat(String(val ?? ''));
  return isNaN(n) ? null : n;
}

async function nextNo(sb: ReturnType<typeof admin>, offset: number): Promise<string> {
  const { data } = await sb
    .from('employees')
    .select('employee_no')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  const base = data ? parseInt(data.employee_no.replace('CF-',''), 10) : 0;
  const n = isNaN(base) ? 0 : base;
  return `CF-${String(n + 1 + offset).padStart(3,'0')}`;
}

export interface BulkRow {
  row: number;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  marital_status?: string;
  email?: string;
  blood_group?: string;
  birth_place?: string;
  nationality?: string;
  mother_tongue?: string;
  caste?: string;
  category?: string;
  sub_caste?: string;
  weight_kg?: string;
  height_cm?: string;
  local_house_no?: string;
  local_street?: string;
  local_city?: string;
  local_district?: string;
  local_state?: string;
  local_pin?: string;
  local_phone?: string;
  perm_house_no?: string;
  perm_street?: string;
  perm_city?: string;
  perm_district?: string;
  perm_state?: string;
  perm_pin?: string;
  perm_phone?: string;
  guardian_name?: string;
  guardian_mobile?: string;
  father_name?: string;
  father_mobile?: string;
  father_occupation?: string;
  mother_name?: string;
  mother_mobile?: string;
  mother_occupation?: string;
  spouse_name?: string;
  spouse_mobile?: string;
  spouse_occupation?: string;
  pf_no?: string;
  pan_no?: string;
  aadhaar_no?: string;
  bank_account_no?: string;
  voter_id?: string;
  driving_licence_no?: string;
  driving_licence_expiry?: string;
  date_of_joining?: string;
  designation?: string;
  department?: string;
  location?: string;
  shift_id?: string;
  employment_type?: string;
  daily_salary_rate?: string;
  owns_vehicle?: string;
  vehicle_type?: string;
}

export interface BulkResult {
  row: number;
  name: string;
  status: 'success' | 'error' | 'skipped';
  employee_no?: string;
  message?: string;
}

export async function bulkImportEmployees(rows: BulkRow[]): Promise<BulkResult[]> {
  const sb  = admin();
  const fy  = currentFY();
  const results: BulkResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();

    // Validate required fields
    if (!r.first_name?.trim() || !r.last_name?.trim()) {
      results.push({ row: r.row, name: name || `Row ${r.row}`, status: 'error', message: 'First name and last name are required' });
      continue;
    }
    if (!r.date_of_joining) {
      results.push({ row: r.row, name, status: 'error', message: 'Date of joining is required' });
      continue;
    }
    const joiningDate = parseDate(r.date_of_joining);
    if (!joiningDate) {
      results.push({ row: r.row, name, status: 'error', message: `Invalid joining date "${r.date_of_joining}" — use DD/MM/YYYY` });
      continue;
    }
    if (!['Factory','Showroom','Site'].includes(r.location ?? '')) {
      results.push({ row: r.row, name, status: 'error', message: `Invalid location "${r.location}" — must be Factory, Showroom, or Site` });
      continue;
    }
    if (!['SHIFT_FW','SHIFT_FO','SHIFT_SW','SHIFT_SITE'].includes(r.shift_id ?? '')) {
      results.push({ row: r.row, name, status: 'error', message: `Invalid shift_id "${r.shift_id}"` });
      continue;
    }
    if (!['Permanent','Probationer','Trainee','Contractual'].includes(r.employment_type ?? '')) {
      results.push({ row: r.row, name, status: 'error', message: `Invalid employment_type "${r.employment_type}"` });
      continue;
    }

    // Check duplicate email
    if (r.email?.trim()) {
      const { data: existing } = await sb.from('employees').select('id,employee_no').eq('email', r.email.trim()).single();
      if (existing) {
        results.push({ row: r.row, name, status: 'skipped', employee_no: existing.employee_no, message: `Email already exists (${existing.employee_no})` });
        continue;
      }
    }

    const employee_no        = await nextNo(sb, i);
    const employment_type    = norm(r.employment_type) as string;
    const probation_end_date = employment_type === 'Probationer' ? calcProbationEnd(joiningDate) : null;

    const payload = {
      employee_no,
      first_name:    r.first_name!.trim(),
      middle_name:   norm(r.middle_name),
      last_name:     r.last_name!.trim(),
      gender:        norm(r.gender),
      date_of_birth: parseDate(r.date_of_birth),
      marital_status: norm(r.marital_status),
      email:          norm(r.email),
      blood_group:    norm(r.blood_group),
      birth_place:    norm(r.birth_place),
      nationality:    norm(r.nationality) ?? 'Indian',
      mother_tongue:  norm(r.mother_tongue),
      caste: norm(r.caste), category: norm(r.category), sub_caste: norm(r.sub_caste),
      weight_kg: normNum(r.weight_kg), height_cm: normNum(r.height_cm),
      local_house_no: norm(r.local_house_no), local_street: norm(r.local_street),
      local_city: norm(r.local_city), local_district: norm(r.local_district),
      local_state: norm(r.local_state), local_pin: norm(r.local_pin),
      local_country: 'India', local_phone: norm(r.local_phone),
      perm_house_no: norm(r.perm_house_no), perm_street: norm(r.perm_street),
      perm_city: norm(r.perm_city), perm_district: norm(r.perm_district),
      perm_state: norm(r.perm_state), perm_pin: norm(r.perm_pin),
      perm_country: 'India', perm_phone: norm(r.perm_phone),
      guardian_name: norm(r.guardian_name), guardian_mobile: norm(r.guardian_mobile),
      father_name: norm(r.father_name), father_mobile: norm(r.father_mobile), father_occupation: norm(r.father_occupation),
      mother_name: norm(r.mother_name), mother_mobile: norm(r.mother_mobile), mother_occupation: norm(r.mother_occupation),
      spouse_name: norm(r.spouse_name), spouse_mobile: norm(r.spouse_mobile), spouse_occupation: norm(r.spouse_occupation),
      pf_no: norm(r.pf_no), pan_no: norm(r.pan_no), aadhaar_no: norm(r.aadhaar_no),
      bank_account_no: norm(r.bank_account_no), voter_id: norm(r.voter_id),
      driving_licence_no: norm(r.driving_licence_no),
      driving_licence_expiry: parseDate(r.driving_licence_expiry),
      date_of_joining: joiningDate,
      designation: norm(r.designation), department: norm(r.department),
      location: norm(r.location),
      shift_id: norm(r.shift_id),
      employment_type,
      probation_end_date,
      status: 'Active',
      owns_vehicle: r.owns_vehicle ? normBool(r.owns_vehicle) : false,
      vehicle_type: norm(r.vehicle_type),
      daily_salary_rate: normNum(r.daily_salary_rate),
    };

    const { data: emp, error } = await sb.from('employees').insert(payload).select('id').single();
    if (error) {
      results.push({ row: r.row, name, status: 'error', message: error.message });
      continue;
    }

    // Create leave balance
    await sb.from('leave_balances').insert({ employee_id: emp.id, financial_year: fy });

    // Audit log
    await sb.from('audit_log').insert({
      table_name: 'employees', record_id: emp.id,
      action: 'INSERT', new_values: { employee_no, source: 'bulk_upload' },
      reason: 'Bulk imported via Excel upload',
    });

    results.push({ row: r.row, name, status: 'success', employee_no });
  }

  revalidatePath('/employees');
  return results;
}
