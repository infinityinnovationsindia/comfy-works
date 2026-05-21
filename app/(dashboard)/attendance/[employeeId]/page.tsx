
'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string,string> = {
  P:'bg-green-100 text-green-800',PL:'bg-teal-100 text-teal-800',
  HPL:'bg-teal-50 text-teal-700',UL:'bg-orange-100 text-orange-800',
  HUL:'bg-orange-50 text-orange-700',H:'bg-blue-100 text-blue-700',
  A:'bg-red-100 text-red-700',AAA:'bg-red-200 text-red-900',
  AA:'bg-red-100 text-red-800',HA:'bg-yellow-100 text-yellow-800',
  LC:'bg-yellow-50 text-yellow-700',EG:'bg-yellow-50 text-yellow-700',
};

export default function EmployeeAttendancePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const router  = useRouter();
  const now     = new Date();
  const [month, setMonth]         = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [records, setRecords]     = useState<any[]>([]);
  const [employee, setEmployee]   = useState<any>(null);
  const [balance, setBalance]     = useState<any>(null);
  const [correcting, setCorrecting] = useState<any>(null);
  const [corrForm, setCorrForm]   = useState({ newStatus:'P', correctionType:'biometric_failure', reason:'' });

  useEffect(() => {
    fetch(`/api/attendance/monthly?month=${month}&employeeId=${employeeId}`)
      .then(r => r.json()).then(setRecords);
    fetch(`/api/leave/balance?employeeId=${employeeId}`)
      .then(r => r.json()).then(setBalance);
    fetch(`/api/employees/${employeeId}`).then(r => r.json()).then(setEmployee);
  }, [month, employeeId]);

  async function submitCorrection() {
    const res = await fetch('/api/attendance/correct', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        employeeId, date: correcting.date,
        newStatus: corrForm.newStatus,
        correctionType: corrForm.correctionType,
        reason: corrForm.reason,
        correctedBy: 'admin', // TODO: use actual logged-in user ID
      }),
    });
    if ((await res.json()).success) {
      setCorrecting(null);
      fetch(`/api/attendance/monthly?month=${month}&employeeId=${employeeId}`).then(r=>r.json()).then(setRecords);
    }
  }

  const totalP  = records.filter(r => ['P','LC','EG'].includes(r.status)).length;
  const totalRM = records.reduce((s,r) => s + (r.red_marks_total??0), 0);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 mb-4">← Back</button>

      {employee && (
        <div className="flex items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{employee.first_name} {employee.last_name}</h1>
            <div className="text-gray-500 text-sm">{employee.employee_no} · {employee.department} · {employee.employment_type}</div>
          </div>
          <div className="ml-auto bg-green-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{balance?.pl_balance ?? 0}</div>
            <div className="text-xs text-gray-500">PL Balance</div>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{totalRM}</div>
            <div className="text-xs text-gray-500">Red Marks</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm" />
        <span className="text-sm text-gray-500">{totalP} days present this month</span>
      </div>

      <div className="bg-white border rounded-xl divide-y">
        {records.map(rec => (
          <div key={rec.date} className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium w-24">{new Date(rec.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',weekday:'short'})}</div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[rec.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {rec.status}
              </span>
              {rec.is_manually_corrected && <span className="text-xs text-blue-500">(corrected)</span>}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {rec.check_in && <span>{new Date(rec.check_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}</span>}
              {rec.check_out && <span>→ {new Date(rec.check_out).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}</span>}
              {rec.hours_worked && <span>{rec.hours_worked.toFixed(1)}h</span>}
              {rec.red_marks_total > 0 && <span className="text-red-500">⚑ {rec.red_marks_total} mark(s)</span>}
              <button onClick={() => setCorrecting(rec)} className="text-xs text-blue-600 hover:underline">Correct</button>
            </div>
          </div>
        ))}
      </div>

      {/* Correction modal */}
      {correcting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">Correct Attendance — {correcting.date}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 block mb-1">Correct status to</label>
                <select value={corrForm.newStatus} onChange={e => setCorrForm(f => ({...f, newStatus: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {['P','PL','HPL','UL','HUL','H','A','AAA','AA','LC','EG'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Correction Type (mandatory)</label>
                <select value={corrForm.correctionType} onChange={e => setCorrForm(f => ({...f, correctionType: e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="biometric_failure">Biometric Failure</option>
                  <option value="approved_leave_not_captured">Approved Leave Not Captured</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Reason (mandatory)</label>
                <textarea value={corrForm.reason} onChange={e => setCorrForm(f => ({...f, reason: e.target.value}))}
                  className="w-full border rounded-lg p-2.5 text-sm" rows={3}
                  placeholder="Explain the reason for correction..." />
              </div>
              {correcting.is_manually_corrected && (
                <p className="text-xs text-gray-500">Previous correction: {correcting.correction_reason}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={submitCorrection} className="flex-1 py-2.5 bg-green-700 text-white rounded-lg text-sm font-medium">
                  Save Correction
                </button>
                <button onClick={() => setCorrecting(null)} className="flex-1 py-2.5 border rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
