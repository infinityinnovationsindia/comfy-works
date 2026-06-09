'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { FileText, Plus, Clock, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'

type LeaveRequest = {
  id: string
  leave_type: string
  half_day_type?: string
  date_from: string
  date_to: string
  working_days_count: number
  pl_to_deduct?: number
  reason: string
  status: string
  notice_violation: boolean
  is_retroactive: boolean
  created_at: string
  rejection_reason?: string
  employee?: {
    first_name: string
    last_name: string
    employee_no: string
    department: string
  }
}

const STATUS_STYLES: Record<string, string> = {
  Pending:      'bg-yellow-100 text-yellow-700',
  L1_Approved:  'bg-blue-100 text-blue-700',
  Approved:     'bg-green-100 text-green-700',
  Rejected:     'bg-red-100 text-red-700',
  Cancelled:    'bg-gray-100 text-gray-600',
}

const STATUS_LABEL: Record<string, string> = {
  Pending:     'Pending',
  L1_Approved: 'L1 Approved',
  Approved:    'Approved ✓',
  Rejected:    'Rejected',
  Cancelled:   'Cancelled',
}

const TYPE_COLOR: Record<string, string> = {
  PL:  'bg-blue-100 text-blue-700',
  HPL: 'bg-blue-50 text-blue-600',
  UL:  'bg-orange-100 text-orange-700',
  HUL: 'bg-orange-50 text-orange-600',
  LC:  'bg-yellow-100 text-yellow-700',
  EG:  'bg-yellow-100 text-yellow-700',
}

export default function LeavePage() {
  const [tab, setTab]               = useState<'mine' | 'pending'>('mine')
  const [myLeaves,  setMyLeaves]    = useState<LeaveRequest[]>([])
  const [pending,   setPending]     = useState<LeaveRequest[]>([])
  const [loading,   setLoading]     = useState(false)
  const [error,     setError]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'mine') {
        const res = await fetch('/api/leave/mine')
        if (!res.ok) throw new Error(`Server error ${res.status}`)
        const json = await res.json()
        setMyLeaves(json.leaves || [])
      } else {
        const res = await fetch('/api/approvals')
        if (!res.ok) throw new Error(`Server error ${res.status}`)
        const json = await res.json()
        setPending(json.leaves || [])
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const items = tab === 'mine' ? myLeaves : pending

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-[#1D9E75]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leave Management</h1>
            <p className="text-sm text-gray-500">Apply and track leave requests</p>
          </div>
        </div>
        <Link
          href="/leave/apply"
          className="flex items-center gap-2 px-4 py-2 bg-[#1D9E75] text-white rounded-xl text-sm font-medium hover:bg-[#178a63] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Apply Leave
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab('mine')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            tab === 'mine' ? 'bg-white shadow-sm text-[#1D9E75]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          My Leaves
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            tab === 'pending' ? 'bg-white shadow-sm text-[#1D9E75]' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending My Approval
          {pending.length > 0 && tab !== 'pending' && (
            <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={load} className="text-sm text-red-600 font-medium flex items-center gap-1 hover:underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          <span>Loading leaves...</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <div className="text-center py-16">
          <FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">
            {tab === 'mine' ? 'No leave requests yet' : 'No pending approvals'}
          </p>
          {tab === 'mine' && (
            <Link href="/leave/apply" className="mt-3 inline-block text-[#1D9E75] text-sm hover:underline">
              Apply for leave →
            </Link>
          )}
        </div>
      )}

      {/* List */}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map(leave => (
            <Link
              key={leave.id}
              href={`/leave/${leave.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1D9E75] hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                {/* Avatar (for pending tab) */}
                {tab === 'pending' && leave.employee && (
                  <div className="w-10 h-10 rounded-full bg-[#1D9E75]/10 flex items-center justify-center flex-shrink-0 text-[#1D9E75] font-bold text-sm">
                    {leave.employee.first_name[0]}{leave.employee.last_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {/* Employee name (pending tab) */}
                  {tab === 'pending' && leave.employee && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {leave.employee.first_name} {leave.employee.last_name}
                      </span>
                      <span className="text-xs text-gray-400">{leave.employee.employee_no}</span>
                    </div>
                  )}
                  {/* Type + Status + Flags */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[leave.leave_type] || 'bg-gray-100 text-gray-600'}`}>
                      {leave.leave_type}{leave.half_day_type ? ` (${leave.half_day_type})` : ''}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[leave.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[leave.status] || leave.status}
                    </span>
                    {leave.notice_violation && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        Notice Violation
                      </span>
                    )}
                    {leave.is_retroactive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        Retroactive
                      </span>
                    )}
                  </div>
                  {/* Dates */}
                  <p className="text-sm text-gray-700 mt-1.5">
                    {fmt(leave.date_from)}
                    {leave.date_from !== leave.date_to && ` → ${fmt(leave.date_to)}`}
                    <span className="mx-1.5 text-gray-400">·</span>
                    <span className="font-medium">{leave.working_days_count} day{leave.working_days_count !== 1 ? 's' : ''}</span>
                    {Number(leave.pl_to_deduct) > 0 && (
                      <span className="ml-1.5 text-blue-600 text-xs">({leave.pl_to_deduct} PL)</span>
                    )}
                  </p>
                  {/* Reason */}
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{leave.reason}</p>
                  {/* Rejection reason */}
                  {leave.status === 'Rejected' && leave.rejection_reason && (
                    <p className="text-xs text-red-600 mt-1 bg-red-50 px-2 py-1 rounded">
                      Reason: {leave.rejection_reason}
                    </p>
                  )}
                </div>
                {/* Applied date */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(leave.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </p>
                  {/* Quick "Review" hint for pending tab — no longer a separate link since whole card is clickable */}
                  {tab === 'pending' && (
                    <p className="text-xs text-[#1D9E75] mt-1">
                      View →
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
