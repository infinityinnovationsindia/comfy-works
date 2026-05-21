'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { calcProbationEnd } from '@/lib/utils';
import type { Employee, Shift } from '@/types/database';

type Props = {
  action: (prev: unknown, fd: FormData) => Promise<{ error?: string }|void>;
  initial?: Partial<Employee>;
  shifts: Shift[];
  managers: { id:string; first_name:string; last_name:string; employee_no:string }[];
};

const TABS = ['Personal','Address','Family','Identity','Employment','Vehicle'] as const;

function Row({ label, req, children }: { label:string; req?:boolean; children:React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-600">
        {label}{req && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "w-full h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400";
const sel = inp + " bg-white";

function Sect({ title }: { title:string }) {
  return <h3 className="col-span-full text-sm font-semibold text-gray-800 border-b border-gray-200 pb-2 mt-4 first:mt-0">{title}</h3>;
}

export default function EmployeeForm({ action, initial={}, shifts, managers }: Props) {
  const [state, formAction] = useFormState(action as (prev: unknown, fd: FormData) => Promise<{ error?: string }|void>, {});
  const [tab,      setTab]      = useState(0);
  const [joinDate, setJoinDate] = useState(initial.date_of_joining ?? '');
  const [empType,  setEmpType]  = useState(initial.employment_type ?? 'Probationer');

  const iv = (k: keyof Employee) => String((initial as Record<string,unknown>)[k] ?? '');
  const probEnd = empType === 'Probationer' && joinDate ? calcProbationEnd(joinDate) : '';

  const FAMILY_MEMBERS = [
    { key:'father', label:'Father' },
    { key:'mother', label:'Mother' },
    { key:'spouse', label:'Spouse' },
  ];

  return (
    <form action={formAction}>
      {/* Tab strip */}
      <div className="flex gap-0 overflow-x-auto border-b border-gray-200 mb-6">
        {TABS.map((t,i) => (
          <button key={t} type="button" onClick={() => setTab(i)}
            className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab===i ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{t}</button>
        ))}
      </div>

      {/* ── Personal ──────────────────────────────────── */}
      <div className={tab===0 ? 'block' : 'hidden'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Row label="First Name" req><input name="first_name" className={inp} defaultValue={iv('first_name')} required/></Row>
          <Row label="Middle Name"><input name="middle_name" className={inp} defaultValue={iv('middle_name')}/></Row>
          <Row label="Surname" req><input name="last_name" className={inp} defaultValue={iv('last_name')} required/></Row>
          <Row label="Gender">
            <select name="gender" className={sel} defaultValue={iv('gender')}>
              <option value="">— Select —</option><option value="M">Male</option><option value="F">Female</option>
            </select>
          </Row>
          <Row label="Date of Birth"><input type="date" name="date_of_birth" className={inp} defaultValue={iv('date_of_birth')}/></Row>
          <Row label="Marital Status">
            <select name="marital_status" className={sel} defaultValue={iv('marital_status')}>
              <option value="">— Select —</option><option value="Single">Single</option><option value="Married">Married</option>
            </select>
          </Row>
          <Row label="Caste"><input name="caste" className={inp} defaultValue={iv('caste')}/></Row>
          <Row label="Category"><input name="category" className={inp} defaultValue={iv('category')}/></Row>
          <Row label="Sub Caste"><input name="sub_caste" className={inp} defaultValue={iv('sub_caste')}/></Row>
          <Row label="Mother Tongue"><input name="mother_tongue" className={inp} defaultValue={iv('mother_tongue')}/></Row>
          <Row label="Nationality"><input name="nationality" className={inp} defaultValue={iv('nationality')||'Indian'}/></Row>
          <Row label="Blood Group">
            <select name="blood_group" className={sel} defaultValue={iv('blood_group')}>
              <option value="">— Select —</option>
              {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Row>
          <Row label="Email"><input type="email" name="email" className={inp} defaultValue={iv('email')}/></Row>
          <Row label="Birth Place"><input name="birth_place" className={inp} defaultValue={iv('birth_place')}/></Row>
          <Row label="Weight (kg)"><input type="number" name="weight_kg" step="0.1" className={inp} defaultValue={iv('weight_kg')}/></Row>
          <Row label="Height (cm)"><input type="number" name="height_cm" step="0.1" className={inp} defaultValue={iv('height_cm')}/></Row>
        </div>
      </div>

      {/* ── Address ──────────────────────────────────── */}
      <div className={tab===1 ? 'block' : 'hidden'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Sect title="Local Address"/>
          <Row label="House / Flat No."><input name="local_house_no" className={inp} defaultValue={iv('local_house_no')}/></Row>
          <Row label="Street / Area"><input name="local_street" className={inp} defaultValue={iv('local_street')}/></Row>
          <Row label="City"><input name="local_city" className={inp} defaultValue={iv('local_city')}/></Row>
          <Row label="District"><input name="local_district" className={inp} defaultValue={iv('local_district')}/></Row>
          <Row label="State"><input name="local_state" className={inp} defaultValue={iv('local_state')}/></Row>
          <Row label="Pin Code"><input name="local_pin" className={inp} defaultValue={iv('local_pin')}/></Row>
          <Row label="Country"><input name="local_country" className={inp} defaultValue={iv('local_country')||'India'}/></Row>
          <Row label="Phone"><input type="tel" name="local_phone" className={inp} defaultValue={iv('local_phone')}/></Row>
          <Sect title="Permanent Address"/>
          <Row label="House / Flat No."><input name="perm_house_no" className={inp} defaultValue={iv('perm_house_no')}/></Row>
          <Row label="Street / Area"><input name="perm_street" className={inp} defaultValue={iv('perm_street')}/></Row>
          <Row label="City"><input name="perm_city" className={inp} defaultValue={iv('perm_city')}/></Row>
          <Row label="District"><input name="perm_district" className={inp} defaultValue={iv('perm_district')}/></Row>
          <Row label="State"><input name="perm_state" className={inp} defaultValue={iv('perm_state')}/></Row>
          <Row label="Pin Code"><input name="perm_pin" className={inp} defaultValue={iv('perm_pin')}/></Row>
          <Row label="Country"><input name="perm_country" className={inp} defaultValue={iv('perm_country')||'India'}/></Row>
          <Row label="Phone"><input type="tel" name="perm_phone" className={inp} defaultValue={iv('perm_phone')}/></Row>
        </div>
      </div>

      {/* ── Family ───────────────────────────────────── */}
      <div className={tab===2 ? 'block' : 'hidden'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Sect title="Local Guardian"/>
          <Row label="Name"><input name="guardian_name" className={inp} defaultValue={iv('guardian_name')}/></Row>
          <Row label="Mobile"><input type="tel" name="guardian_mobile" className={inp} defaultValue={iv('guardian_mobile')}/></Row>
          {FAMILY_MEMBERS.map(({ key, label }) => (
            <>
              <Sect key={key+'hdr'} title={label}/>
              <Row key={key+'n'} label="Name"><input name={`${key}_name`} className={inp} defaultValue={iv(`${key}_name` as keyof Employee)}/></Row>
              <Row key={key+'m'} label="Mobile"><input type="tel" name={`${key}_mobile`} className={inp} defaultValue={iv(`${key}_mobile` as keyof Employee)}/></Row>
              <Row key={key+'e'} label="Email"><input type="email" name={`${key}_email`} className={inp} defaultValue={iv(`${key}_email` as keyof Employee)}/></Row>
              <Row key={key+'o'} label="Occupation"><input name={`${key}_occupation`} className={inp} defaultValue={iv(`${key}_occupation` as keyof Employee)}/></Row>
              <Row key={key+'i'} label="Annual Income (₹)"><input name={`${key}_income`} className={inp} defaultValue={iv(`${key}_income` as keyof Employee)}/></Row>
            </>
          ))}
        </div>
      </div>

      {/* ── Identity ─────────────────────────────────── */}
      <div className={tab===3 ? 'block' : 'hidden'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row label="Permanent PF No."><input name="pf_no" className={inp} defaultValue={iv('pf_no')}/></Row>
          <Row label="PAN Card No."><input name="pan_no" className={inp+" uppercase"} defaultValue={iv('pan_no')}/></Row>
          <Row label="Aadhaar No."><input name="aadhaar_no" className={inp} defaultValue={iv('aadhaar_no')}/></Row>
          <Row label="Bank Account No."><input name="bank_account_no" className={inp} defaultValue={iv('bank_account_no')}/></Row>
          <Row label="Voter ID"><input name="voter_id" className={inp} defaultValue={iv('voter_id')}/></Row>
          <Row label="Driving Licence No."><input name="driving_licence_no" className={inp} defaultValue={iv('driving_licence_no')}/></Row>
          <Row label="DL Expiry Date"><input type="date" name="driving_licence_expiry" className={inp} defaultValue={iv('driving_licence_expiry')}/></Row>
        </div>
        <p className="mt-4 text-xs text-gray-400 bg-amber-50 border border-amber-100 rounded-lg p-3">
          ⚠ Document numbers are stored securely. Document scan uploads available in Phase 2.
          Only HR & Accounts can view identity documents.
        </p>
      </div>

      {/* ── Employment ───────────────────────────────── */}
      <div className={tab===4 ? 'block' : 'hidden'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Row label="Date of Joining" req>
            <input type="date" name="date_of_joining" required className={inp}
              value={joinDate} onChange={e => setJoinDate(e.target.value)}/>
          </Row>
          <Row label="Designation"><input name="designation" className={inp} defaultValue={iv('designation')}/></Row>
          <Row label="Department"><input name="department" className={inp} defaultValue={iv('department')}/></Row>
          <Row label="Location" req>
            <select name="location" required className={sel} defaultValue={iv('location')}>
              <option value="">— Select —</option>
              <option value="Factory">Factory</option>
              <option value="Showroom">Showroom</option>
              <option value="Site">Site</option>
            </select>
          </Row>
          <Row label="Shift Group" req>
            <select name="shift_id" required className={sel} defaultValue={iv('shift_id')}>
              <option value="">— Select Shift —</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
            </select>
          </Row>
          <Row label="Reporting Manager">
            <select name="reporting_manager_id" className={sel} defaultValue={iv('reporting_manager_id')}>
              <option value="">— None —</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.employee_no})</option>)}
            </select>
          </Row>
          <Row label="Employment Type" req>
            <select name="employment_type" required className={sel}
              value={empType} onChange={e => setEmpType(e.target.value)}>
              <option value="">— Select —</option>
              <option value="Permanent">Permanent</option>
              <option value="Probationer">Probationer</option>
              <option value="Trainee">Trainee</option>
              <option value="Contractual">Contractual</option>
            </select>
          </Row>
          <Row label="Probation End Date (auto)">
            <input className={inp} value={probEnd || (empType !== 'Probationer' ? 'N/A' : '')}
              readOnly disabled placeholder="Set joining date first"/>
          </Row>
          <Row label="Status">
            <select name="status" className={sel} defaultValue={iv('status')||'Active'}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Resigned">Resigned</option>
              <option value="Terminated">Terminated</option>
            </select>
          </Row>
          <Row label="Daily Salary Rate ₹ (Accounts only)">
            <input type="number" name="daily_salary_rate" step="0.01" className={inp}
              defaultValue={iv('daily_salary_rate')} placeholder="Optional — filled by Kiran/Neal"/>
          </Row>
        </div>
      </div>

      {/* ── Vehicle ──────────────────────────────────── */}
      <div className={tab===5 ? 'block' : 'hidden'}>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" name="owns_vehicle" defaultChecked={!!initial.owns_vehicle}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"/>
            <span className="text-sm font-medium text-gray-700">Employee owns a vehicle</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <Row label="Vehicle Type">
              <select name="vehicle_type" className={sel} defaultValue={iv('vehicle_type')}>
                <option value="">— Select —</option>
                <option value="2-Wheeler">2-Wheeler</option>
                <option value="4-Wheeler">4-Wheeler</option>
              </select>
            </Row>
          </div>
        </div>
      </div>

      {/* Error + Submit */}
      <div className="mt-8 pt-5 border-t border-gray-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 text-sm text-gray-400">
          {TABS.map((t,i) => (
            <button key={t} type="button" onClick={() => setTab(i)}
              className={`px-2 py-1 rounded ${tab===i ? 'text-brand-600 font-medium' : 'hover:text-gray-600'}`}>{i+1}</button>
          ))}
        </div>
        <div className="flex gap-3 ml-auto items-center flex-wrap">
          {(state as {error?:string})?.error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(state as {error?:string}).error}
            </p>
          )}
          <button type="button" onClick={() => window.history.back()}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors">
            Save Employee
          </button>
        </div>
      </div>
    </form>
  );
}
