'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import { bulkImportEmployees, type BulkRow, type BulkResult } from './bulk-actions';

type Step = 'idle' | 'preview' | 'importing' | 'done';

const COLUMN_MAP: Record<string, keyof BulkRow> = {
  'first_name*':                          'first_name',
  'middle_name':                          'middle_name',
  'last_name*':                           'last_name',
  'gender (M/F)':                         'gender',
  'date_of_birth (DD/MM/YYYY)':           'date_of_birth',
  'marital_status (Single/Married)':      'marital_status',
  'email':                                'email',
  'blood_group (A+/A-/B+/B-/AB+/AB-/O+/O-)': 'blood_group',
  'birth_place':                          'birth_place',
  'nationality':                          'nationality',
  'mother_tongue':                        'mother_tongue',
  'caste':                                'caste',
  'category':                             'category',
  'sub_caste':                            'sub_caste',
  'weight_kg':                            'weight_kg',
  'height_cm':                            'height_cm',
  'local_house_no':                       'local_house_no',
  'local_street':                         'local_street',
  'local_city':                           'local_city',
  'local_district':                       'local_district',
  'local_state':                          'local_state',
  'local_pin':                            'local_pin',
  'local_phone':                          'local_phone',
  'perm_house_no':                        'perm_house_no',
  'perm_street':                          'perm_street',
  'perm_city':                            'perm_city',
  'perm_district':                        'perm_district',
  'perm_state':                           'perm_state',
  'perm_pin':                             'perm_pin',
  'perm_phone':                           'perm_phone',
  'guardian_name':                        'guardian_name',
  'guardian_mobile':                      'guardian_mobile',
  'father_name':                          'father_name',
  'father_mobile':                        'father_mobile',
  'father_occupation':                    'father_occupation',
  'mother_name':                          'mother_name',
  'mother_mobile':                        'mother_mobile',
  'mother_occupation':                    'mother_occupation',
  'spouse_name':                          'spouse_name',
  'spouse_mobile':                        'spouse_mobile',
  'spouse_occupation':                    'spouse_occupation',
  'pf_no':                                'pf_no',
  'pan_no':                               'pan_no',
  'aadhaar_no':                           'aadhaar_no',
  'bank_account_no':                      'bank_account_no',
  'voter_id':                             'voter_id',
  'driving_licence_no':                   'driving_licence_no',
  'driving_licence_expiry (DD/MM/YYYY)':  'driving_licence_expiry',
  'date_of_joining* (DD/MM/YYYY)':        'date_of_joining',
  'designation':                          'designation',
  'department':                           'department',
  'location* (Factory/Showroom/Site)':    'location',
  'shift_id* (SHIFT_FW/SHIFT_FO/SHIFT_SW/SHIFT_SITE)': 'shift_id',
  'employment_type* (Permanent/Probationer/Trainee/Contractual)': 'employment_type',
  'daily_salary_rate':                    'daily_salary_rate',
  'owns_vehicle (Yes/No)':                'owns_vehicle',
  'vehicle_type (2-Wheeler/4-Wheeler)':   'vehicle_type',
};

export default function BulkUploadPage() {
  const [step,     setStep]     = useState<Step>('idle');
  const [rows,     setRows]     = useState<BulkRow[]>([]);
  const [results,  setResults]  = useState<BulkResult[]>([]);
  const [error,    setError]    = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target?.result, { type: 'binary', cellDates: false });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data: Record<string,unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data.length) { setError('No data rows found in the file.'); return; }

        const parsed: BulkRow[] = data.map((row, i) => {
          const mapped: BulkRow = { row: i + 2 }; // row 2 = first data row
          Object.entries(row).forEach(([col, val]) => {
            const field = COLUMN_MAP[col];
            if (field) (mapped as Record<string, unknown>)[field] = val ? String(val) : '';
          });
          return mapped;
        });

        // Filter out completely empty rows
        const nonEmpty = parsed.filter(r =>
          (r.first_name?.trim() || r.last_name?.trim() || r.email?.trim())
        );

        if (!nonEmpty.length) { setError('No valid rows found. Make sure you filled data in the "Employee Data" sheet.'); return; }

        setRows(nonEmpty);
        setStep('preview');
      } catch {
        setError('Could not read the file. Make sure you are uploading the Comfy Works template (.xlsx).');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function runImport() {
    setStep('importing');
    try {
      const res = await bulkImportEmployees(rows);
      setResults(res);
      setStep('done');
    } catch {
      setError('Import failed. Please try again.');
      setStep('preview');
    }
  }

  function reset() {
    setStep('idle'); setRows([]); setResults([]); setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount   = results.filter(r => r.status === 'error').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/employees" className="text-gray-400 hover:text-gray-600 text-sm">Employees</Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-700 font-medium">Bulk Upload</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Bulk Employee Upload</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload multiple employees at once using the Excel template</p>
        </div>
      </div>

      {/* Step 1: Instructions + Download */}
      {(step === 'idle' || step === 'preview') && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">How it works</h2>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {[
              { n:'1', title:'Download Template', desc:'Get the Excel template with all fields and instructions' },
              { n:'2', title:'Fill Employee Data', desc:'Add employees in the sheet. Required fields are marked with *' },
              { n:'3', title:'Upload & Review', desc:'Upload the filled file, review the preview, then import' },
            ].map(s => (
              <div key={s.n} className="flex gap-3 flex-1">
                <div className="w-7 h-7 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{s.n}</div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Download template */}
          <div className="flex flex-wrap gap-3 items-center p-4 bg-brand-50 border border-brand-100 rounded-xl">
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-800">Employee Upload Template</p>
              <p className="text-xs text-brand-600 mt-0.5">Excel file · All fields · Example row included · Instructions sheet</p>
            </div>
            <a href="/api/employees/template" download
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Template
            </a>
          </div>
        </div>
      )}

      {/* Step 2: Upload zone */}
      {step === 'idle' && (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-400 transition-colors p-10 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <p className="text-gray-700 font-medium mb-1">Upload filled Excel file</p>
          <p className="text-sm text-gray-400 mb-5">Only the Comfy Works template (.xlsx) is accepted</p>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 mb-4 inline-block">{error}</p>}
          <div>
            <label className="cursor-pointer bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors inline-block">
              Choose File
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile}/>
            </label>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Preview — {rows.length} employee{rows.length !== 1 ? 's' : ''} found</h2>
                <p className="text-xs text-gray-500 mt-0.5">Review before importing. Required fields are validated.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={runImport}
                  className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors">
                  Import {rows.length} Employee{rows.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Row</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Name</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Email</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Joining</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Location</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Shift</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(r => (
                    <tr key={r.row} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{r.row}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || <span className="text-red-500 text-xs">Missing name</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{r.email || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{r.date_of_joining || <span className="text-red-500">Missing</span>}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {['Factory','Showroom','Site'].includes(r.location ?? '')
                          ? <span className="text-gray-700">{r.location}</span>
                          : <span className="text-red-500">{r.location || 'Missing'}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.shift_id || <span className="text-red-500">Missing</span>}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.employment_type || <span className="text-red-500">Missing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
          <p className="text-gray-700 font-medium">Importing {rows.length} employees…</p>
          <p className="text-sm text-gray-400 mt-1">This may take a moment</p>
        </div>
      )}

      {/* Step 5: Results */}
      {step === 'done' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{successCount}</p>
              <p className="text-xs text-gray-500 mt-1">Imported</p>
            </div>
            <div className="bg-white rounded-xl border border-yellow-200 p-4 text-center">
              <p className="text-3xl font-bold text-yellow-500">{skippedCount}</p>
              <p className="text-xs text-gray-500 mt-1">Skipped (duplicate)</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
              <p className="text-3xl font-bold text-red-500">{errorCount}</p>
              <p className="text-xs text-gray-500 mt-1">Errors</p>
            </div>
          </div>

          {/* Row-by-row results */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Import Results</h2>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                  Upload Another File
                </button>
                <Link href="/employees" className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors">
                  View Employees →
                </Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Row</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Name</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Employee No.</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-500">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map(r => (
                    <tr key={r.row} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{r.row}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{r.employee_no ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {r.status === 'success' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Imported</span>}
                        {r.status === 'skipped' && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Skipped</span>}
                        {r.status === 'error'   && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">✗ Error</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.message ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
