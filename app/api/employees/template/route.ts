import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET() {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Employee Data ─────────────────────────────────────
  const headers = [
    'first_name*', 'middle_name', 'last_name*',
    'gender (M/F)', 'date_of_birth (DD/MM/YYYY)',
    'marital_status (Single/Married)',
    'email', 'blood_group (A+/A-/B+/B-/AB+/AB-/O+/O-)',
    'birth_place', 'nationality', 'mother_tongue',
    'caste', 'category', 'sub_caste',
    'weight_kg', 'height_cm',
    // Address
    'local_house_no', 'local_street', 'local_city',
    'local_district', 'local_state', 'local_pin', 'local_phone',
    'perm_house_no', 'perm_street', 'perm_city',
    'perm_district', 'perm_state', 'perm_pin', 'perm_phone',
    // Family
    'guardian_name', 'guardian_mobile',
    'father_name', 'father_mobile', 'father_occupation',
    'mother_name', 'mother_mobile', 'mother_occupation',
    'spouse_name', 'spouse_mobile', 'spouse_occupation',
    // Identity
    'pf_no', 'pan_no', 'aadhaar_no', 'bank_account_no',
    'voter_id', 'driving_licence_no', 'driving_licence_expiry (DD/MM/YYYY)',
    // Employment
    'date_of_joining* (DD/MM/YYYY)',
    'designation', 'department',
    'location* (Factory/Showroom/Site)',
    'shift_id* (SHIFT_FW/SHIFT_FO/SHIFT_SW/SHIFT_SITE)',
    'employment_type* (Permanent/Probationer/Trainee/Contractual)',
    'daily_salary_rate',
    // Vehicle
    'owns_vehicle (Yes/No)',
    'vehicle_type (2-Wheeler/4-Wheeler)',
  ];

  const example = [
    'Ramesh', 'Kumar', 'Shah',
    'M', '15/08/1990',
    'Married',
    'ramesh@example.com', 'B+',
    'Ahmedabad', 'Indian', 'Gujarati',
    '', '', '',
    '70', '172',
    'B-12', 'Navrangpura', 'Ahmedabad',
    'Ahmedabad', 'Gujarat', '380009', '9876543210',
    'B-12', 'Navrangpura', 'Ahmedabad',
    'Ahmedabad', 'Gujarat', '380009', '9876543210',
    'Suresh Shah', '9876543211',
    'Rajesh Shah', '9876543212', 'Business',
    'Meena Shah', '9876543213', 'Homemaker',
    '', '', '',
    '', 'ABCDE1234F', '', '123456789012',
    '', '', '',
    '01/06/2024',
    'Carpenter', 'Production',
    'Factory',
    'SHIFT_FW',
    'Probationer',
    '600',
    'No',
    '',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, example]);

  // Column widths
  ws['!cols'] = headers.map(() => ({ wch: 22 }));

  // Style header row (SheetJS community doesn't support rich styles, but we can note it)
  XLSX.utils.book_append_sheet(wb, ws, 'Employee Data');

  // ── Sheet 2: Instructions ──────────────────────────────────────
  const instructions = [
    ['COMFY WORKS — Bulk Employee Upload Template'],
    [''],
    ['INSTRUCTIONS'],
    ['1. Fill employee data in the "Employee Data" sheet starting from row 3 (row 2 is the example — you can delete it)'],
    ['2. Columns marked with * are required. Leave others blank if unknown.'],
    ['3. Date format must be DD/MM/YYYY exactly (e.g. 15/08/1990)'],
    ['4. Do NOT change the column headers in row 1'],
    ['5. Upload the filled file at Employees → Bulk Upload'],
    [''],
    ['VALID VALUES FOR KEY COLUMNS'],
    ['gender:', 'M or F'],
    ['marital_status:', 'Single or Married'],
    ['location:', 'Factory | Showroom | Site'],
    ['shift_id:', 'SHIFT_FW (Factory Workers 8AM-5PM) | SHIFT_FO (Factory Office 9AM-6PM) | SHIFT_SW (Showroom) | SHIFT_SITE (Site Staff)'],
    ['employment_type:', 'Permanent | Probationer | Trainee | Contractual'],
    ['blood_group:', 'A+ | A- | B+ | B- | AB+ | AB- | O+ | O-'],
    ['owns_vehicle:', 'Yes or No'],
    ['vehicle_type:', '2-Wheeler or 4-Wheeler'],
    [''],
    ['NOTES'],
    ['- Employee numbers (CF-001 etc.) are auto-assigned by the system'],
    ['- Probation end date is auto-calculated (joining date + 1 year) for Probationers'],
    ['- daily_salary_rate is optional — can be filled later by Accounts team'],
    ['- You can upload multiple times — duplicates by email will be skipped'],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2['!cols'] = [{ wch: 25 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="comfy-works-employee-template.xlsx"',
    },
  });
}
