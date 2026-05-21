'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, AlertCircle, Info, ChevronLeft, RefreshCw, UserCheck } from 'lucide-react'

const LEAVE_TYPES = [
  { value: 'PL',  label: 'PL — Paid Leave (Full Day)' },
  { value: 'HPL', label: 'HPL — Half Paid Leave' },
  { value: 'UL',  label: 'UL — Unpaid Leave (Full Day)' },
  { value: 'HUL', label: 'HUL — Half Unpaid Leave' },
  { value: 'LC',  label: 'LC — Late Coming' },
  { value: 'EG',  label: 'EG — Early Going' },
]

type Balance = { pl_earned: number; pl_used: number; pl_balance: number; employment_type: string }
type Employee = { id: string; employee_no: string; first_name: string; last_name: string; department: string }

export default function ApplyLeavePage() {
  const router = useRouter()

  // On-behalf state
  const [canOnBehalf,    setCanOnBehalf]    = useState(false)
  const [employees,      setEmployees]      = useState<Employee[]>([])
  const [selectedEmpId,  setSelectedEmpId]  = useState('') // empty = self
  const [myEmpId,        setMyEmpId]        = useState('')

  // Balance
  const [balance,   setBalance]   = useState<Balance | null>(null)
  const [balLoading, setBalLoading] = useState(true)
  const [balErr,    setBalErr]    = useState('')

  // Form fields
  const [leaveType,    setLeaveType]    = useState('PL')
  const [halfDayType,  setHalfDayType]  = useState('First Half')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [reason,       setReason]       = useState('')
  const [outOfStation, setOutOfStation] = useState(false)
  const [contact,      setContact]      = useState('')
  const [address,      setAddress]      = useState('')

  // Sandwich preview
  const [sandwich,   setSandwich]   = useState<any>(null)
  const [swLoading,  setSwLoading]  = useState(false)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitErr,  setSubmitErr]  = useState('')
  const [submitted,  setSubmitted]  = useState(false)

  const isHalfDay  = ['HPL','HUL'].includes(leaveType)
  const isSingleDay = ['LC','EG','HPL','HUL'].includes(leaveType)
  const targetEmpId = selectedEmpId || myEmpId

  // Load user role + employee list
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        setMyEmpId(data.employee_id || '')
        const adminRoles = ['super_admin','hr_assistant','supervisor','production_head','design_head','project_head']
        if (adminRoles.includes(data.role)) {
          setCanOnBehalf(true)
          fetch('/api/employees/simple')
            .then(r => r.json())
            .then(d => setEmployees(d.employees || []))
        }
      })
      .catch(() => {})
  }, [])

  // Load balance (re-fetches when target employee changes)
  useEffect(() => {
    if (!myEmpId && !selectedEmpId) return
    setBalLoading(true)
    setBalance(null)
    setBalErr('')
    const url = selectedEmpId ? `/api/leave/balance?employee_id=${selectedEmpId}` : '/api/leave/balance'
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return r.json() })
      .then(data => setBalance(data))
      .catch(e => setBalErr(e.message))
      .finally(() => setBalLoading(false))
  }, [myEmpId, selectedEmpId])

  // Sandwich rule preview
  useEffect(() => {
    if (!dateFrom || (!dateTo && !isSingleDay)) return
    const to = isSingleDay ? dateFrom : dateTo
    if (!to || to < dateFrom) return
    setSwLoading(true)
    setSandwich(null)
    fetch(`/api/leave/sandwich?from=${dateFrom}&to=${to}&type=${leaveType}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSandwich(d) })
      .catch(() => {})
      .finally(() => setSwLoading(false))
  }, [dateFrom, dateTo, leaveType, isSingleDay])

  async function handleSubmit() {
    if (!dateFrom) { setSubmitErr('Please select a date.'); return }
    if (!reason.trim()) { setSubmitErr('Please enter a reason.'); return }
    if (!isSingleDay && (!dateTo || dateTo < dateFrom)) { setSubmitErr('Invalid date range.'); return }

    // Block if selected dates are all holidays/non-working
    if (sandwich && (sandwich.blocked || sandwich.working_days === 0)) {
      setSubmitErr(sandwich.block_reason || 'Selected dates are holidays. Cannot apply leave.'); return
    }
    if (['PL','HPL'].includes(leaveType) && balance && balance.pl_balance <= 0) {
      setSubmitErr('Insufficient PL balance. Please select Unpaid Leave instead.'); return
    }
    setSubmitting(true)
    setSubmitErr('')
    try {
      const res = await fetch('/api/leave/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_type:               leaveType,
          half_day_type:            isHalfDay ? halfDayType : null,
          date_from:                dateFrom,
          date_to:                  isSingleDay ? dateFrom : dateTo,
          reason:                   reason.trim(),
          out_of_station:           outOfStation,
          out_of_station_contact:   outOfStation ? contact : null,
          out_of_station_address:   outOfStation ? address : null,
          on_behalf_employee_id:    selectedEmpId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitErr(data.error || 'Failed to submit.'); return }
      setSubmitted(true)
      setTimeout(() => router.push('/leave'), 1800)
    } catch { setSubmitErr('Network error. Please try again.') }
    finally { setSubmitting(false) }
  }

  if (submitted) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Leave Applied!</h2>
      <p className="text-gray-500">Request sent to approver. Redirecting...</p>
    </div>
  )

  const selectedEmp = employees.find(e => e.id === selectedEmpId)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Apply Leave</h1>
          <p className="text-sm text-gray-500">Fill in the details below</p>
        </div>
      </div>

      {/* On-behalf selector — only for admins/hr_assistant */}
      {canOnBehalf && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-blue-600" />
            <p className="text-sm font-semibold text-blue-800">Filing on behalf of</p>
          </div>
          <select
            value={selectedEmpId}
            onChange={e => { setSelectedEmpId(e.target.value); setSandwich(null) }}
            className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="">Myself</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name} ({e.employee_no}) — {e.department}
              </option>
            ))}
          </select>
          {selectedEmp && (
            <p className="text-xs text-blue-600 mt-1.5 font-medium">
              Filing for: {selectedEmp.first_name} {selectedEmp.last_name} · {selectedEmp.employee_no}
            </p>
          )}
        </div>
      )}

      {/* PL Balance card */}
      <div className="bg-gradient-to-r from-[#1D9E75] to-[#178a63] rounded-2xl p-4 text-white mb-5">
        {balLoading ? (
          <div className="flex items-center gap-2 text-green-100">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading balance...</span>
          </div>
        ) : balErr ? (
          <p className="text-green-200 text-sm">Balance unavailable</p>
        ) : balance ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-200 uppercase tracking-wide">PL Balance</p>
              <p className="text-3xl font-bold">{balance.pl_balance.toFixed(1)}</p>
              <p className="text-xs text-green-200 mt-0.5">
                {balance.pl_earned.toFixed(1)} earned · {balance.pl_used.toFixed(1)} used
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              balance.employment_type === 'Permanent' ? 'bg-white/20' : 'bg-yellow-400/30 text-yellow-100'
            }`}>
              {balance.employment_type}
              {balance.employment_type !== 'Permanent' && ' · PL not yet usable'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        {/* Leave type */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Leave Type <span className="text-red-500">*</span>
          </label>
          <select
            value={leaveType}
            onChange={e => { setLeaveType(e.target.value); setSandwich(null) }}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
          >
            {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Half day type */}
        {isHalfDay && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Half Day</label>
            <div className="flex gap-2 mt-1">
              {['First Half','Second Half'].map(h => (
                <button key={h} type="button" onClick={() => setHalfDayType(h)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    halfDayType === h ? 'bg-[#1D9E75] text-white border-[#1D9E75]' : 'border-gray-200 text-gray-600 hover:border-[#1D9E75]'
                  }`}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dates */}
        <div className={`grid gap-3 ${isSingleDay ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {isSingleDay ? 'Date' : 'From Date'} <span className="text-red-500">*</span>
            </label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
          </div>
          {!isSingleDay && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                To Date <span className="text-red-500">*</span>
              </label>
              <input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
            </div>
          )}
        </div>

        {/* Sandwich preview */}
        {swLoading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking holidays in range...
          </div>
        )}
        {sandwich && !swLoading && (sandwich.blocked || sandwich.working_days === 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium">Cannot apply leave</p>
                <p className="text-red-600 text-xs mt-0.5">
                  {sandwich.block_reason || 'Selected dates are holidays or non-working days. No leave can be applied.'}
                </p>
              </div>
            </div>
          </div>
        )}
        {sandwich && !swLoading && !sandwich.blocked && sandwich.working_days > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-800 font-medium">
                  {sandwich.working_days} day{sandwich.working_days !== 1 ? 's' : ''}
                  {['PL','HPL'].includes(leaveType) && sandwich.pl_to_deduct > 0 && ` · ${sandwich.pl_to_deduct} PL will be deducted`}
                </p>
                {sandwich.holidays_in_range?.length > 0 && (
                  <p className="text-blue-600 text-xs mt-0.5">
                    Includes: {sandwich.holidays_in_range.map((h: any) => h.name).join(', ')} (sandwich rule)
                  </p>
                )}
                {sandwich.notice_violation && (
                  <p className="text-red-600 text-xs mt-0.5 font-medium">
                    ⚠ Notice period not met — request will be flagged
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Insufficient PL warning */}
        {['PL','HPL'].includes(leaveType) && balance && balance.pl_balance <= 0 && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Insufficient PL Balance</p>
              <p className="text-xs mt-0.5">Balance is 0. Please select Unpaid Leave (UL).</p>
            </div>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason for leave..."
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" />
        </div>

        {/* Out of station */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={outOfStation} onChange={e => setOutOfStation(e.target.checked)}
            className="w-4 h-4 accent-[#1D9E75]" />
          <span className="text-sm text-gray-700">Traveling out of station</span>
        </label>

        {outOfStation && (
          <div className="space-y-3 pl-7">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contact Number</label>
              <input type="tel" value={contact} onChange={e => setContact(e.target.value)}
                placeholder="Mobile while away"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address / Destination</label>
              <textarea rows={2} value={address} onChange={e => setAddress(e.target.value)}
                placeholder="Where will you be staying?"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" />
            </div>
          </div>
        )}

        {submitErr && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {submitErr}
          </div>
        )}

        <button onClick={handleSubmit}
          disabled={submitting || balLoading || (sandwich !== null && sandwich.working_days === 0)}
          className="w-full py-3 bg-[#1D9E75] text-white rounded-xl text-sm font-medium hover:bg-[#178a63] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
          {submitting ? <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</> : 'Submit Leave Request'}
        </button>
        <p className="text-xs text-gray-400 text-center">
          {selectedEmp
            ? `Filing on behalf of ${selectedEmp.first_name} ${selectedEmp.last_name} — will go to their approval chain`
            : 'Request will be sent to your reporting manager for approval.'}
        </p>
      </div>
    </div>
  )
}
