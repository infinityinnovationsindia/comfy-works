'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, AlertCircle, RefreshCw, UserCheck } from 'lucide-react'

type Emp = { id: string; employee_no: string; first_name: string; last_name: string; department: string }

export default function TimeOffApplyPage() {
  const router = useRouter()
  const [canOnBehalf,   setCanOnBehalf]   = useState(false)
  const [employees,     setEmployees]     = useState<Emp[]>([])
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [date,          setDate]          = useState('')
  const [timeOut,       setTimeOut]       = useState('')
  const [timeInExp,     setTimeInExp]     = useState('')
  const [purpose,       setPurpose]       = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [submitErr,     setSubmitErr]     = useState('')
  const [submitted,     setSubmitted]     = useState(false)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(data => {
      const adminRoles = ['super_admin','hr_assistant','supervisor','production_head','design_head','project_head']
      if (adminRoles.includes(data.role)) {
        setCanOnBehalf(true)
        fetch('/api/employees/simple').then(r => r.json()).then(d => setEmployees(d.employees || []))
      }
    }).catch(() => {})
  }, [])

  async function submit() {
    if (!date || !timeOut || !purpose.trim()) { setSubmitErr('Please fill all required fields.'); return }
    setSubmitting(true); setSubmitErr('')
    try {
      const res = await fetch('/api/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, time_out: timeOut,
          time_in_expected: timeInExp || null,
          purpose: purpose.trim(),
          on_behalf_employee_id: selectedEmpId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitErr(data.error || 'Failed to submit.'); return }
      setSubmitted(true)
      setTimeout(() => router.push('/time-off'), 1800)
    } catch { setSubmitErr('Network error. Please try again.') }
    finally { setSubmitting(false) }
  }

  if (submitted) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Time Off Requested!</h2>
      <p className="text-gray-500">Sent to supervisor for approval. Redirecting...</p>
    </div>
  )

  const selectedEmp = employees.find(e => e.id === selectedEmpId)

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Apply Time Off</h1>
          <p className="text-sm text-gray-500">Personal errand pass</p>
        </div>
      </div>

      {canOnBehalf && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-blue-600" />
            <p className="text-sm font-semibold text-blue-800">Filing on behalf of</p>
          </div>
          <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)}
            className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
            <option value="">Myself</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name} ({e.employee_no}) — {e.department}
              </option>
            ))}
          </select>
          {selectedEmp && (
            <p className="text-xs text-blue-600 mt-1.5 font-medium">
              Filing for: {selectedEmp.first_name} {selectedEmp.last_name}
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date <span className="text-red-500">*</span></label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Time Out <span className="text-red-500">*</span></label>
            <input type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Expected Return</label>
            <input type="time" value={timeInExp} onChange={e => setTimeInExp(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Purpose <span className="text-red-500">*</span></label>
          <textarea rows={3} value={purpose} onChange={e => setPurpose(e.target.value)}
            placeholder="Reason for stepping out..."
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" />
        </div>
        {submitErr && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {submitErr}
          </div>
        )}
        <button onClick={submit} disabled={submitting}
          className="w-full py-3 bg-[#1D9E75] text-white rounded-xl text-sm font-medium hover:bg-[#178a63] disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</> : 'Submit Request'}
        </button>
      </div>
    </div>
  )
}
