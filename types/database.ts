export type EmploymentType = 'Permanent'|'Probationer'|'Trainee'|'Contractual';
export type EmployeeStatus = 'Active'|'Inactive'|'Resigned'|'Terminated';
export type LocationType   = 'Factory'|'Showroom'|'Site';
export type UserRole = 'super_admin'|'production_head'|'design_head'|'project_head'|'accounts'|'supervisor'|'employee'|'security';

export interface Shift {
  id: string; name: string; start_time: string; end_time: string;
  location: string|null; notes: string|null; created_at: string;
}

export interface Employee {
  id: string; employee_no: string;
  first_name: string; middle_name: string|null; last_name: string;
  gender: 'M'|'F'|null; date_of_birth: string|null;
  marital_status: 'Single'|'Married'|null;
  caste: string|null; category: string|null; sub_caste: string|null;
  mother_tongue: string|null; nationality: string|null;
  email: string|null; blood_group: string|null;
  weight_kg: number|null; height_cm: number|null;
  birth_place: string|null; photo_url: string|null;
  local_house_no: string|null; local_street: string|null; local_city: string|null;
  local_district: string|null; local_state: string|null; local_pin: string|null;
  local_country: string|null; local_phone: string|null;
  perm_house_no: string|null; perm_street: string|null; perm_city: string|null;
  perm_district: string|null; perm_state: string|null; perm_pin: string|null;
  perm_country: string|null; perm_phone: string|null;
  guardian_name: string|null; guardian_mobile: string|null;
  father_name: string|null; father_mobile: string|null; father_email: string|null;
  father_occupation: string|null; father_income: string|null;
  mother_name: string|null; mother_mobile: string|null; mother_email: string|null;
  mother_occupation: string|null; mother_income: string|null;
  spouse_name: string|null; spouse_mobile: string|null; spouse_email: string|null;
  spouse_occupation: string|null; spouse_income: string|null;
  pf_no: string|null; pan_no: string|null; aadhaar_no: string|null;
  bank_account_no: string|null; voter_id: string|null;
  driving_licence_no: string|null; driving_licence_expiry: string|null;
  pan_doc_url: string|null; aadhaar_doc_url: string|null;
  dl_doc_url: string|null; voter_doc_url: string|null;
  date_of_joining: string; designation: string|null; department: string|null;
  location: LocationType|null; shift_id: string|null;
  reporting_manager_id: string|null;
  employment_type: EmploymentType|null; probation_end_date: string|null;
  status: EmployeeStatus; owns_vehicle: boolean|null; vehicle_type: string|null;
  daily_salary_rate: number|null; created_at: string; updated_at: string;
  shifts?: Shift;
  reporting_manager?: { id:string; first_name:string; last_name:string }|null;
}

export interface Holiday {
  id: string; calendar_type: 'Factory'|'Showroom';
  date: string; name: string; type: string|null; created_at: string;
}

export interface AttendanceDaily {
  id: string; employee_id: string; date: string;
  check_in: string|null; check_out: string|null; hours_worked: number|null;
  status: string;
  red_marks_morning: number; red_marks_evening: number; red_marks_total: number;
  is_manually_corrected: boolean; correction_reason: string|null; original_status: string|null;
  employees?: Pick<Employee,'employee_no'|'first_name'|'last_name'|'department'|'location'>;
}

export interface AttendancePunch {
  id: string; employee_id: string; punched_at: string;
  punch_type: 'Check-In'|'Check-Out'; device_id: string|null;
}
