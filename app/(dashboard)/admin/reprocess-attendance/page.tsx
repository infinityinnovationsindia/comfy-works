'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  RefreshCw, AlertTriangle, Calendar, Users, Filter,
  CheckCircle, XCircle, Loader2, ArrowLeft, ChevronDown, Search,
} from 'lucide-react'

type Category = { id: string; name: string; code: string }
type Employee = {
  id: string
  employee_no: string
  first_name: string
  last_name: string
  category_id: string | null
  category_code: string | null
  shift_id: string | null
  shift_name: string | null
}

type ScopeType = 'all' | 'category' | 'employees'

type BatchResult = {
  date: string
  processed: number
  skipped: number
  errors: string[]
  statusBefore: Record<string, number>
  statusAfter: Record<string, number>
  durationMs: number
}

// ───── helpers ────────────────────────────────────────────────────────────
function ymd(d: Date) { return d.toISOString().slice(0, 10) }
function todayYmd() { return ymd(new Date()) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function listDates(from: string, to: string): string[] {
  const out: string[] = []
  let cur = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (cur <= end) { out.push(ymd(cur)); cur = addDays(cur, 1) }
  return out
}
function fmt(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ───── component ──────────────────────────────────────────────────────────
export default function ReprocessAttendancePage() {
  // Form state
  const [dateFrom, setDateFrom] = useState(todayYmd())
  const [dateTo,   setDateTo]   = useState(todayYmd())
  const [scopeType, setScopeType] = useState<ScopeType>('all')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [triggerReason, setTriggerReason] = useState('')

  // Reference data
  const [categories, setCategories] = useState<Category[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [empSearch, setEmpSearch] = useState('')

  // Run state
  const [runState, setRunState] = useState<'idle' | 'confirming' | 'running' | 'done'>('idle')
  const [runId, setRunId] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [runError, setRunError] = useState('')
  const [confirmText, setConfirmText] = useState('')

  // Load reference data
  useEffect(() => {
    (async () => {
      try {
        const [cRes, eRes] = await Promise.all([
          fetch('/api/categories').then(r => r.json()).catch(() => []),
          fetch('/api/employees/simple').then(r => r.json()).then(d => d.employees || []),
        ])
        setCategories(Array.isArray(cRes) ? cRes : (cRes.categories || []))
        setEmployees(eRes)
      } catch (e) {
        console.error('Failed to load reference data', e)
      }
    })()
  }, [])

  // Computed
  const dates = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return []
    return listDates(dateFrom, dateTo)
  }, [dateFrom, dateTo])

  const isFutureRange = dateTo > todayYmd()
  const isInvalidRange = dateFrom > dateTo
  const isTooLong = dates.length > 30

  const resolvedEmployeeIds = useMemo(() => {
    if (scopeType === 'all') return employees.map(e => e.id)
    if (scopeType === 'category') {
      return employees
        .filter(e => e.category_id && selectedCategoryIds.includes(e.category_id))
        .map(e => e.id)
    }
    return selectedEmployeeIds
  }, [scopeType, selectedCategoryIds, selectedEmployeeIds, employees])

  const scopedEmployees = useMemo(
    () => employees.filter(e => resolvedEmployeeIds.includes(e.id)),
    [employees, resolvedEmployeeIds]
  )

  const filteredEmployees = useMemo(() => {
    if (!empSearch) return employees
    const q = empSearch.toLowerCase()
    return employees.filter(e =>
      e.employee_no.toLowerCase().includes(q) ||
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q)
    )
  }, [employees, empSearch])

  const totalRows = dates.length * resolvedEmployeeIds.length
  const needsConfirmation = totalRows > 100 || scopeType === 'all' && dates.length > 7
  const needsTypedConfirmation = dates.length > 14 && scopeType === 'all'

  const canRun =
    dates.length > 0 &&
    !isInvalidRange &&
    !isFutureRange &&
    !isTooLong &&
    resolvedEmployeeIds.length > 0 &&
    runState === 'idle'

  // Aggregate status diff across all completed batches
  const aggregatedDiff = useMemo(() => {
    const before: Record<string, number> = {}
    const after: Record<string, number> = {}
    for (const b of batchResults) {
      for (const [k, v] of Object.entries(b.statusBefore)) before[k] = (before[k] ?? 0) + v
      for (const [k, v] of Object.entries(b.statusAfter)) after[k] = (after[k] ?? 0) + v
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return { before, after, keys: Array.from(keys).sort() }
  }, [batchResults])

  // ───── presets ─────
  const setPreset = useCallback((preset: string) => {
    const today = new Date()
    const t = ymd(today)
    if (preset === 'today') { setDateFrom(t); setDateTo(t) }
    else if (preset === 'yesterday') {
      const y = ymd(addDays(today, -1))
      setDateFrom(y); setDateTo(y)
    }
    else if (preset === 'last7') {
      setDateFrom(ymd(addDays(today, -6))); setDateTo(t)
    }
    else if (preset === 'last30') {
      setDateFrom(ymd(addDays(today, -29))); setDateTo(t)
    }
    else if (preset === 'thisMonth') {
      setDateFrom(t.slice(0, 8) + '01'); setDateTo(t)
    }
  }, [])

  // ───── execute run ─────
  const handleRun = async () => {
    setRunState('running')
    setRunError('')
    setBatchResults([])
    setProgress({ done: 0, total: dates.length })

    try {
      // 1. Start run
      const startRes = await fetch('/api/admin/reprocess-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          dateFrom,
          dateTo,
          scopeType,
          categoryIds: scopeType === 'category' ? selectedCategoryIds : undefined,
          employeeIds: scopeType === 'employees' ? selectedEmployeeIds : undefined,
          triggerReason: triggerReason || null,
        }),
      })

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}))
        throw new Error(err.error || `Start failed (${startRes.status})`)
      }
      const startData = await startRes.json()
      setRunId(startData.runId)

      // 2. Iterate dates
      const results: BatchResult[] = []
      for (let i = 0; i < startData.dates.length; i++) {
        const date = startData.dates[i]
        const batchRes = await fetch('/api/admin/reprocess-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'batch', runId: startData.runId, date }),
        })
        if (!batchRes.ok) {
          const err = await batchRes.json().catch(() => ({}))
          throw new Error(`Batch failed for ${date}: ${err.error || batchRes.status}`)
        }
        const batchData = await batchRes.json()
        results.push(batchData)
        setBatchResults([...results])
        setProgress({ done: i + 1, total: startData.dates.length })
      }

      // 3. Finish
      await fetch('/api/admin/reprocess-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish', runId: startData.runId, finalStatus: 'completed' }),
      })

      setRunState('done')
    } catch (e: any) {
      setRunError(e.message || 'Run failed')
      if (runId) {
        await fetch('/api/admin/reprocess-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finish', runId, finalStatus: 'failed' }),
        }).catch(() => {})
      }
      setRunState('done')
    }
  }

  const reset = () => {
    setRunState('idle')
    setRunId(null)
    setBatchResults([])
    setProgress({ done: 0, total: 0 })
    setRunError('')
    setConfirmText('')
  }

  // ───── render ─────
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/settings" className="text-sm text-gray-500 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Reprocess Attendance</h1>
        <p className="text-sm text-gray-500 mt-1">
          Re-runs the attendance engine for a date range. Overwrites existing rows.{' '}
          <span className="font-medium text-gray-700">Manually-corrected rows are always preserved.</span>
        </p>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <p className="font-medium">Destructive action — cannot be undone.</p>
          <p className="mt-0.5">Use this after engine changes, bridge downtime, or holiday corrections. For routine bulk-assign reprocessing, the bulk-assign page is faster.</p>
        </div>
      </div>

      {/* CARD 1 — Date Range */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-[#1D9E75]" />
          <h2 className="text-sm font-semibold text-gray-900">1. Date Range</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">From</label>
            <input
              type="date"
              value={dateFrom}
              max={todayYmd()}
              onChange={e => setDateFrom(e.target.value)}
              disabled={runState !== 'idle'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">To</label>
            <input
              type="date"
              value={dateTo}
              max={todayYmd()}
              onChange={e => setDateTo(e.target.value)}
              disabled={runState !== 'idle'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { k: 'today', l: 'Today' },
            { k: 'yesterday', l: 'Yesterday' },
            { k: 'last7', l: 'Last 7 days' },
            { k: 'last30', l: 'Last 30 days' },
            { k: 'thisMonth', l: 'This month' },
          ].map(p => (
            <button
              key={p.k}
              onClick={() => setPreset(p.k)}
              disabled={runState !== 'idle'}
              className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {p.l}
            </button>
          ))}
        </div>

        {dates.length > 0 && !isInvalidRange && !isFutureRange && (
          <p className="text-xs text-gray-500 mt-3">
            {dates.length} day{dates.length !== 1 ? 's' : ''} selected
            {isTooLong && <span className="text-red-600 font-medium"> · exceeds 30-day cap</span>}
          </p>
        )}
        {isInvalidRange && <p className="text-xs text-red-600 mt-3">From date must be on or before To date</p>}
        {isFutureRange && <p className="text-xs text-red-600 mt-3">Cannot reprocess future dates</p>}
      </div>

      {/* CARD 2 — Employee Scope */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-[#1D9E75]" />
          <h2 className="text-sm font-semibold text-gray-900">2. Employee Scope</h2>
        </div>

        <div className="space-y-3">
          {/* All */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={scopeType === 'all'}
              onChange={() => setScopeType('all')}
              disabled={runState !== 'idle'}
            />
            <span className="text-sm">All active employees ({employees.length})</span>
          </label>

          {/* By category */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={scopeType === 'category'}
              onChange={() => setScopeType('category')}
              disabled={runState !== 'idle'}
            />
            <span className="text-sm">By category</span>
          </label>
          {scopeType === 'category' && (
            <div className="ml-6 grid grid-cols-2 gap-2">
              {categories.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(c.id)}
                    onChange={() => {
                      setSelectedCategoryIds(prev =>
                        prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                      )
                    }}
                    disabled={runState !== 'idle'}
                  />
                  <span className="text-sm">{c.name} <span className="text-xs text-gray-400">({c.code})</span></span>
                </label>
              ))}
            </div>
          )}

          {/* Specific employees */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={scopeType === 'employees'}
              onChange={() => setScopeType('employees')}
              disabled={runState !== 'idle'}
            />
            <span className="text-sm">Specific employees</span>
          </label>
          {scopeType === 'employees' && (
            <div className="ml-6">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or employee no..."
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  disabled={runState !== 'idle'}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredEmployees.map(e => (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.includes(e.id)}
                      onChange={() => {
                        setSelectedEmployeeIds(prev =>
                          prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id]
                        )
                      }}
                      disabled={runState !== 'idle'}
                    />
                    <span className="text-sm flex-1">{e.first_name} {e.last_name}</span>
                    <span className="text-xs text-gray-400">{e.employee_no}</span>
                    {e.category_code && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{e.category_code}</span>
                    )}
                  </label>
                ))}
              </div>
              {selectedEmployeeIds.length > 0 && (
                <p className="text-xs text-gray-500 mt-1.5">{selectedEmployeeIds.length} selected</p>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          {resolvedEmployeeIds.length} employee{resolvedEmployeeIds.length !== 1 ? 's' : ''} in scope
        </p>
      </div>

      {/* CARD 3 — Reason (optional) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">3. Reason (optional)</h2>
        <input
          type="text"
          value={triggerReason}
          onChange={e => setTriggerReason(e.target.value)}
          placeholder="e.g. Categories assigned for factory floor — reprocess June 1-9"
          disabled={runState !== 'idle'}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <p className="text-xs text-gray-400 mt-1.5">Stored in audit log. Helps you find this run later.</p>
      </div>

      {/* CARD 4 — Preview & Run */}
      {runState === 'idle' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">4. Preview</h2>
          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <p>
              <span className="font-semibold">{dates.length}</span> date{dates.length !== 1 ? 's' : ''} ×{' '}
              <span className="font-semibold">{resolvedEmployeeIds.length}</span> employee{resolvedEmployeeIds.length !== 1 ? 's' : ''} ={' '}
              <span className="font-semibold">{totalRows}</span> row{totalRows !== 1 ? 's' : ''} to recompute
            </p>
            {scopedEmployees.length > 0 && scopedEmployees.length <= 10 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1.5">Employees in scope:</p>
                <ul className="text-xs text-gray-700 space-y-0.5">
                  {scopedEmployees.map(e => (
                    <li key={e.id}>
                      • {e.first_name} {e.last_name} <span className="text-gray-400">({e.employee_no})</span>
                      {e.category_code && <span className="ml-1 text-gray-400">[{e.category_code}]</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scopedEmployees.length > 10 && (
              <p className="text-xs text-gray-500 mt-2">First 5: {scopedEmployees.slice(0, 5).map(e => `${e.first_name} ${e.last_name}`).join(', ')}... and {scopedEmployees.length - 5} more</p>
            )}
          </div>

          {needsTypedConfirmation && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-900 mb-2">
                Large reprocess. Type <strong>REPROCESS</strong> to enable the button.
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm font-mono"
                placeholder="Type REPROCESS"
              />
            </div>
          )}

          <button
            onClick={() => {
              if (needsConfirmation && runState === 'idle') {
                if (confirm(`Reprocess ${totalRows} rows? This cannot be undone.`)) handleRun()
              } else {
                handleRun()
              }
            }}
            disabled={!canRun || (needsTypedConfirmation && confirmText !== 'REPROCESS')}
            className="w-full mt-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Run Reprocess
          </button>
        </div>
      )}

      {/* RUNNING */}
      {runState === 'running' && (
        <div className="bg-white border border-blue-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            <h2 className="text-sm font-semibold text-gray-900">Running...</h2>
          </div>
          <div className="bg-gray-100 rounded-full h-2 overflow-hidden mb-2">
            <div
              className="bg-blue-600 h-full transition-all"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-700">
            {progress.done} / {progress.total} dates processed
          </p>
          {batchResults.length > 0 && (
            <div className="mt-4 max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
              {batchResults.map(b => (
                <div key={b.date} className="px-3 py-1.5 text-xs flex items-center justify-between border-b border-gray-100 last:border-b-0">
                  <span className="font-medium">{fmt(b.date)}</span>
                  <span className="text-gray-500">
                    {b.processed} processed
                    {b.skipped > 0 && <span className="text-amber-600 ml-2">{b.skipped} skipped</span>}
                    {b.errors.length > 0 && <span className="text-red-600 ml-2">{b.errors.length} errors</span>}
                    <span className="text-gray-400 ml-2">{(b.durationMs / 1000).toFixed(1)}s</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DONE */}
      {runState === 'done' && (
        <div className={`bg-white border rounded-xl p-5 ${runError ? 'border-red-200' : 'border-green-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            {runError
              ? <XCircle className="h-5 w-5 text-red-600" />
              : <CheckCircle className="h-5 w-5 text-green-600" />}
            <h2 className="text-sm font-semibold text-gray-900">
              {runError ? 'Failed' : 'Completed'}
            </h2>
          </div>

          {runError && (
            <p className="text-sm text-red-700 mb-4">{runError}</p>
          )}

          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Dates processed" value={progress.done} />
            <Stat label="Rows processed" value={batchResults.reduce((s, b) => s + b.processed, 0)} />
            <Stat label="Manually preserved" value={batchResults.reduce((s, b) => s + b.skipped, 0)} />
          </div>

          {aggregatedDiff.keys.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-gray-700 mb-2">Status changes</p>
              <div className="space-y-1">
                {aggregatedDiff.keys.map(k => {
                  const before = aggregatedDiff.before[k] ?? 0
                  const after = aggregatedDiff.after[k] ?? 0
                  const delta = after - before
                  if (before === 0 && after === 0) return null
                  return (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <code className="font-mono">{k}</code>
                      <span className="font-mono">
                        {before} → {after}
                        {delta !== 0 && (
                          <span className={`ml-2 ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ({delta > 0 ? '+' : ''}{delta})
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {batchResults.some(b => b.errors.length > 0) && (
            <details className="mt-3">
              <summary className="text-xs text-red-700 cursor-pointer">Errors ({batchResults.reduce((s, b) => s + b.errors.length, 0)})</summary>
              <div className="mt-2 max-h-40 overflow-y-auto text-xs bg-red-50 rounded p-2 font-mono">
                {batchResults.flatMap(b =>
                  b.errors.map((e, i) => <div key={`${b.date}-${i}`}>{b.date}: {e}</div>)
                )}
              </div>
            </details>
          )}

          <button
            onClick={reset}
            className="mt-4 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Run another
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
