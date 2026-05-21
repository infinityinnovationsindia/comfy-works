'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, AlertCircle, Info, ChevronLeft, RefreshCw } from 'lucide-react'

const LEAVE_TYPES = [
  { value: 'PL',  label: 'PL — Paid Leave (Full Day)' },
  { value: 'HPL', label: 'HPL — Half Paid Leave' },
  { value: 'UL',  label: 'UL — Unpaid Leave (Full Day)' },
  { value: 'HUL', label: 'HUL — Half Unpaid Leave' },
  { value: 'LC',  label: 'LC — Late Coming' },
  { value: 'EG',  label: 'EG — Early Going' },
]

const HALF_DAY_TYPES = ['First Half', 'Second Half']

type Balance = {
  pl_earned: number
  pl_used: number
  pl_balance: number
  employment_type: string
}

type SandwichResult = {
  working_days: number
  pl_to_deduct: number
  holidays_in_range: { date: string; name: string }[]
  notice_violation: boolean
}

export default function ApplyLeavePage() {
  const router = useRouter()

  const [balance,      setBalance]      = useState<Balance | null>(null)
  const [balanceErr,   setBalanceErr]   = useState('')
  const [balLoading,   setBalLoading]   = useState(true)

  const [leaveType,    setLeaveType]    = useState('PL')
  const [halfDayType,  setHalfDayType]  = useState('First Half')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [reason,       setReason]       = useState('')
  const [outOfStation, setOutOfStation] = useState(false)
  const [contact,      setContact]      = useState('')
  const [address,      setAddress]      = useState('')

  const [sandwich,     setSandwich]     = useState<SandwichResult | null>(null)
  const [swLoading,    setSwLoading]    = useState(false)

  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')
  const [submitted,    setSubmitted]    = useState(false)

  const isHalfDay = ['HPL','HUL'].includes(leaveType)
  const isSingleDay = ['LC','EG','HPL','HUL'].includes(leaveType)

  // Fetch PL balance on mount
  useEffect(() => {
    setBalLoading(true)
    fetch('/api/leave/balance')
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`)
        return r.json()
      })
      .then(data => {
        setBalance(data)
        setBalanceErr('')
      })
      .catch(e => setBalanceErr(e.message))
      .finally(() => setBalLoading(false))
  }, [])

  // Fetch sandwich calculation when dates change
  useEffect(() => {
    if (!dateFrom || (!dateTo && !isSingleDay)) return
    const to = isSingleDay ? dateFrom : dateTo
    if (!to || to < dateFrom) return

    setSwLoading(true)
    setSandwich(null)
    fetch(`/api/leave/sandwich?from=${dateFrom}&to=${to}&type=${leaveType}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setSandwich(data)
      })
      .catch(() => {})
      .finally(() => setSwLoading(false))
  }, [dateFrom, dateTo, leaveType, isSingleDay])

  async function handleSubmit() {
    if (!dateFrom) { setSubmitError('Please select a date.'); return }
    if (!reason.trim()) { setSubmitError('Please enter a reason.'); return }
    if (!isSingleDay && (!dateTo || dateTo < dateFrom)) {
      setSubmitError('Please select a valid date range.'); return
    }
    if (['PL','HPL'].includes(leaveType) && balance && balance.pl_balance <= 0) {
      setSubmitError('Insufficient PL balance. Please select Unpaid Leave instead.')
      return
    }

    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/leave/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_type:      leaveType,
          half_day_type:   isHalfDay ? halfDayType : null,
          date_from:       dateFrom,
          date_to:         isSingleDay ? dateFrom : dateTo,
          reason:          reason.trim(),
          out_of_station:  outOfStation,
          out_of_station_contact: outOfStation ? contact : null,
          out_of_station_address: outOfStation ? address : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to submit. Please try again.')
        return
      }
      setSubmitted(true)
      setTimeout(() => router.push('/leave'), 2000)
    } catch (e: any) {
      setSubmitError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✓</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Leave Applied!</h2>
        <p className="text-gray-500">Your request has been sent to your approver. Redirecting...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Apply Leave</h1>
          <p className="text-sm text-gray-500">Fill in the details below</p>
        </div>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-r from-[#1D9E75] to-[#178a63] rounded-2xl p-4 text-white mb-5">
        {balLoading ? (
          <div className="flex items-center gap-2 text-green-100">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading balance...</span>
          </div>
        ) : balanceErr ? (
          <p className="text-green-200 text-sm">Could not load balance — {balanceErr}</p>
        ) : balance ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-200 uppercase tracking-wide">PL Balance</p>
              <p className="text-3xl font-bold">{balance.pl_balance.toFixed(1)}</p>
              <p className="text-xs text-green-200 mt-0.5">
                {balance.pl_earned.toFixed(1)} earned · {balance.pl_used.toFixed(1)} used
              </p>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                balance.employment_type === 'Permanent'
                  ? 'bg-white/20 text-white'
                  : 'bg-yellow-400/30 text-yellow-100'
              }`}>
                {balance.employment_type}
              </span>
              {balance.employment_type !== 'Permanent' && (
                <p className="text-xs text-yellow-200 mt-1">PL usable after confirmation</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        {/* Leave Type */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Leave Type <span className="text-red-500">*</span>
          </label>
          <select
            value={leaveType}
            onChange={e => { setLeaveType(e.target.value); setSandwich(null) }}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
          >
            {LEAVE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Half Day Type */}
        {isHalfDay && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Half Day</label>
            <div className="flex gap-2 mt-1">
              {HALF_DAY_TYPES.map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHalfDayType(h)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    halfDayType === h
                      ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                      : 'border-gray-200 text-gray-600 hover:border-[#1D9E75]'
                  }`}
                >
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
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
            />
          </div>
          {!isSingleDay && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                To Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={e => setDateTo(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
              />
            </div>
          )}
        </div>

        {/* Sandwich rule preview */}
        {swLoading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Checking holidays in range...
          </div>
        )}
        {sandwich && !swLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-800 font-medium">
                  {sandwich.working_days} working day{sandwich.working_days !== 1 ? 's' : ''}
                  {['PL','HPL'].includes(leaveType) && ` · ${sandwich.pl_to_deduct} PL will be deducted`}
                </p>
                {sandwich.holidays_in_range.length > 0 && (
                  <p className="text-blue-600 text-xs mt-1">
                    Includes: {sandwich.holidays_in_range.map(h => h.name).join(', ')} (sandwich rule applied)
                  </p>
                )}
                {sandwich.notice_violation && (
                  <p className="text-red-600 text-xs mt-1 font-medium">
                    ⚠ Notice period not met — request will be flagged for approver
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PL balance warning */}
        {['PL','HPL'].includes(leaveType) && balance && balance.pl_balance <= 0 && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Insufficient PL Balance</p>
              <p className="text-xs mt-0.5">Your PL balance is 0. Please select Unpaid Leave (UL) instead.</p>
            </div>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason for leave..."
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
          />
        </div>

        {/* Out of station */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={outOfStation}
            onChange={e => setOutOfStation(e.target.checked)}
            className="w-4 h-4 accent-[#1D9E75]"
          />
          <span className="text-sm text-gray-700">Traveling out of station</span>
        </label>

        {outOfStation && (
          <div className="space-y-3 pl-7">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contact Number</label>
              <input
                type="tel"
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="Mobile number while away"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address / Destination</label>
              <textarea
                rows={2}
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Where will you be staying?"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
              />
            </div>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || balLoading}
          className="w-full py-3 bg-[#1D9E75] text-white rounded-xl text-sm font-medium hover:bg-[#178a63] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</>
          ) : (
            'Submit Leave Request'
          )}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Request will be sent to your reporting manager for approval via WhatsApp.
        </p>
      </div>
    </div>
  )
}
