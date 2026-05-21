'use client'

import { useEffect, useState } from 'react'
import { CheckSquare, Clock, Navigation2, Timer, ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react'

type LeaveItem = {
  id: string
  leave_type: string
  date_from: string
  date_to: string
  working_days_count: number
  pl_to_deduct: number
  reason: string
  notice_violation: boolean
  is_retroactive: boolean
  status: string
  created_at: string
  employee: { first_name: string; last_name: string; employee_no: string; department: string; designation: string }
}
type SimpleItem = {
  id: string
  date: string
  time_out: string
  purpose: string
  location_to_visit?: string
  vehicle_type?: string
  status: string
  created_at: string
  employee: { first_name: string; last_name: string; employee_no: string; department: string }
}

const LEAVE_COLOR: Record<string, string> = {
  PL: 'bg-blue-100 text-blue-700',
  HPL: 'bg-blue-50 text-blue-600',
  UL: 'bg-orange-100 text-orange-700',
  HUL: 'bg-orange-50 text-orange-600',
  LC: 'bg-yellow-100 text-yellow-700',
  EG: 'bg-yellow-100 text-yellow-700',
}

export default function ApprovalsPage() {
  const [tab,      setTab]      = useState<'leave'|'timeoff'|'onduty'>('leave')
  const [data,     setData]     = useState<any>({ leaves: [], timeoffs: [], onduties: [] })
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [comment,  setComment]  = useState<Record<string, string>>({})
  const [acting,   setActing]   = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/approvals')
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function act(type: string, id: string, action: 'approve' | 'reject') {
    setActing(id + action)
    try {
      await fetch(`/api/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, action, comment: comment[id] || '' }),
      })
      await load()
      setExpanded(null)
    } finally {
      setActing(null)
    }
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  function fmtTime(t: string) {
    if (!t) return '—'
    const [h, m] = t.split(':')
    const hr = parseInt(h)
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
  }

  const tabs = [
    { key: 'leave',   label: 'Leave',   count: data.leaves?.length   || 0, icon: Clock },
    { key: 'timeoff', label: 'Time Off', count: data.timeoffs?.length || 0, icon: Timer },
    { key: 'onduty',  label: 'On Duty',  count: data.onduties?.length || 0, icon: Navigation2 },
  ] as const

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <CheckSquare className="h-6 w-6 text-[#1D9E75]" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500">Requests waiting for your action</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white shadow-sm text-[#1D9E75]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                tab === t.key ? 'bg-[#1D9E75] text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400">Loading approvals...</div>
      )}

      {/* ── LEAVE TAB ── */}
      {!loading && tab === 'leave' && (
        <div className="space-y-3">
          {data.leaves.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No pending leave requests</p>
            </div>
          )}
          {data.leaves.map((l: LeaveItem) => (
            <div key={l.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="p-4 cursor-pointer flex items-start gap-4"
                onClick={() => setExpanded(expanded === l.id ? null : l.id)}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#1D9E75]/10 flex items-center justify-center flex-shrink-0 text-[#1D9E75] font-bold text-sm">
                  {l.employee.first_name[0]}{l.employee.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {l.employee.first_name} {l.employee.last_name}
                    </span>
                    <span className="text-xs text-gray-400">{l.employee.employee_no}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAVE_COLOR[l.leave_type] || 'bg-gray-100 text-gray-600'}`}>
                      {l.leave_type}
                    </span>
                    {l.notice_violation && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> NOTICE VIOLATION
                      </span>
                    )}
                    {l.is_retroactive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        RETROACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-0.5">
                    {fmt(l.date_from)} → {fmt(l.date_to)}
                    <span className="mx-1.5 text-gray-400">·</span>
                    <span className="font-medium text-gray-700">{l.working_days_count} day{l.working_days_count !== 1 ? 's' : ''}</span>
                    {l.pl_to_deduct > 0 && (
                      <span className="ml-1.5 text-blue-600">({l.pl_to_deduct} PL)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{l.employee.designation} · {l.employee.department}</div>
                </div>
                {expanded === l.id ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />}
              </div>

              {expanded === l.id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                    <strong>Reason:</strong> {l.reason}
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Comment (optional)
                    </label>
                    <textarea
                      rows={2}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      placeholder="Add a comment..."
                      value={comment[l.id] || ''}
                      onChange={e => setComment(prev => ({ ...prev, [l.id]: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => act('leave', l.id, 'approve')}
                      disabled={!!acting}
                      className="flex-1 py-2 bg-[#1D9E75] text-white rounded-lg text-sm font-medium hover:bg-[#178a63] disabled:opacity-50 transition-colors"
                    >
                      {acting === l.id + 'approve' ? 'Approving...' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => act('leave', l.id, 'reject')}
                      disabled={!!acting}
                      className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      {acting === l.id + 'reject' ? 'Rejecting...' : '✗ Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TIME OFF TAB ── */}
      {!loading && tab === 'timeoff' && (
        <div className="space-y-3">
          {data.timeoffs.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Timer className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No pending time-off requests</p>
            </div>
          )}
          {data.timeoffs.map((t: SimpleItem) => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="p-4 cursor-pointer flex items-start gap-4"
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              >
                <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center flex-shrink-0 text-yellow-600 font-bold text-sm">
                  {t.employee.first_name[0]}{t.employee.last_name[0]}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    {t.employee.first_name} {t.employee.last_name}
                    <span className="ml-2 text-xs text-gray-400">{t.employee.employee_no}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {fmt(t.date)} · Out at {fmtTime(t.time_out)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{t.purpose}</div>
                </div>
                {expanded === t.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>
              {expanded === t.id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  <p className="mt-3 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg"><strong>Purpose:</strong> {t.purpose}</p>
                  <textarea
                    rows={2}
                    className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                    placeholder="Comment (optional)..."
                    value={comment[t.id] || ''}
                    onChange={e => setComment(prev => ({ ...prev, [t.id]: e.target.value }))}
                  />
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => act('timeoff', t.id, 'approve')} disabled={!!acting}
                      className="flex-1 py-2 bg-[#1D9E75] text-white rounded-lg text-sm font-medium hover:bg-[#178a63] disabled:opacity-50">
                      {acting === t.id + 'approve' ? 'Approving...' : '✓ Approve'}
                    </button>
                    <button onClick={() => act('timeoff', t.id, 'reject')} disabled={!!acting}
                      className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                      ✗ Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── ON DUTY TAB ── */}
      {!loading && tab === 'onduty' && (
        <div className="space-y-3">
          {data.onduties.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Navigation2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No pending on-duty requests</p>
            </div>
          )}
          {data.onduties.map((od: SimpleItem) => (
            <div key={od.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="p-4 cursor-pointer flex items-start gap-4"
                onClick={() => setExpanded(expanded === od.id ? null : od.id)}
              >
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-sm">
                  {od.employee.first_name[0]}{od.employee.last_name[0]}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    {od.employee.first_name} {od.employee.last_name}
                    <span className="ml-2 text-xs text-gray-400">{od.employee.employee_no}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {fmt(od.date)} · {od.location_to_visit}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{od.vehicle_type} vehicle · {od.purpose}</div>
                </div>
                {expanded === od.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>
              {expanded === od.id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  <p className="mt-3 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    <strong>Purpose:</strong> {od.purpose}<br />
                    <strong>Location:</strong> {od.location_to_visit}<br />
                    <strong>Vehicle:</strong> {od.vehicle_type}
                  </p>
                  <textarea
                    rows={2}
                    className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                    placeholder="Comment (optional)..."
                    value={comment[od.id] || ''}
                    onChange={e => setComment(prev => ({ ...prev, [od.id]: e.target.value }))}
                  />
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => act('onduty', od.id, 'approve')} disabled={!!acting}
                      className="flex-1 py-2 bg-[#1D9E75] text-white rounded-lg text-sm font-medium hover:bg-[#178a63] disabled:opacity-50">
                      ✓ Approve
                    </button>
                    <button onClick={() => act('onduty', od.id, 'reject')} disabled={!!acting}
                      className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                      ✗ Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
