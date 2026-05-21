'use client'

import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'P',   label: 'P — Present (full day)' },
  { value: 'PL',  label: 'PL — Paid Leave' },
  { value: 'HPL', label: 'HPL — Half Paid Leave' },
  { value: 'UL',  label: 'UL — Unpaid Leave' },
  { value: 'HUL', label: 'HUL — Half Unpaid Leave' },
  { value: 'H',   label: 'H — Holiday' },
  { value: 'A',   label: 'A — Absent (single punch)' },
  { value: 'AAA', label: 'AAA — Unapproved Absence (3× penalty)' },
  { value: 'AA',  label: 'AA — Unauth Half Day (2× penalty)' },
  { value: 'HA',  label: 'HA — Unauth 1 Hr Gap (0.5× penalty)' },
  { value: 'LC',  label: 'LC — Late Coming' },
  { value: 'EG',  label: 'EG — Early Going' },
]

const REASON_OPTIONS = [
  'Biometric failure / machine error',
  'Employee was present but not captured',
  'Approved leave not recorded in system',
  'Manual entry for site / off-site employee',
  'Retroactive approval',
  'Other (specify below)',
]

interface Props {
  employeeId: string
  employeeName: string
  date: string
  currentStatus: string
  onClose: () => void
  onSuccess: () => void
}

export default function CorrectionModal({
  employeeId,
  employeeName,
  date,
  currentStatus,
  onClose,
  onSuccess,
}: Props) {
  const [newStatus,    setNewStatus]    = useState(currentStatus)
  const [reasonPreset, setReasonPreset] = useState(REASON_OPTIONS[0])
  const [reasonExtra,  setReasonExtra]  = useState('')
  const [checkIn,      setCheckIn]      = useState('')
  const [checkOut,     setCheckOut]     = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const fullReason = reasonPreset === 'Other (specify below)'
    ? reasonExtra
    : reasonPreset + (reasonExtra ? ` — ${reasonExtra}` : '')

  async function submit() {
    if (!fullReason.trim()) {
      setError('Please provide a reason for the correction.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/attendance/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          date,
          new_status: newStatus,
          reason: fullReason,
          check_in:  checkIn  || undefined,
          check_out: checkOut || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        setError(j.error || 'Failed to save correction.')
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Correct Attendance</h2>
            <p className="text-sm text-gray-500 mt-0.5">{employeeName} · {fmtDate(date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Current → New status */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">Current</p>
              <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg font-bold text-sm">
                {currentStatus}
              </span>
            </div>
            <div className="flex-1 text-center text-gray-400 font-medium">→</div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">New Status</p>
              <span className="px-2.5 py-1 bg-[#1D9E75]/10 text-[#1D9E75] rounded-lg font-bold text-sm">
                {newStatus}
              </span>
            </div>
          </div>

          {/* New status select */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Change Status To
            </label>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Optional time correction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Check-In (optional)
              </label>
              <input
                type="time"
                value={checkIn}
                onChange={e => setCheckIn(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Check-Out (optional)
              </label>
              <input
                type="time"
                value={checkOut}
                onChange={e => setCheckOut(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reasonPreset}
              onChange={e => setReasonPreset(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
            >
              {REASON_OPTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <textarea
              rows={2}
              placeholder="Additional details..."
              value={reasonExtra}
              onChange={e => setReasonExtra(e.target.value)}
              className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
            />
          </div>

          {/* Audit notice */}
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>This correction is permanently logged with your name, timestamp, and reason. Original value is preserved.</span>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 py-2.5 bg-[#1D9E75] text-white rounded-xl text-sm font-medium hover:bg-[#178a63] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Correction'}
          </button>
        </div>
      </div>
    </div>
  )
}
