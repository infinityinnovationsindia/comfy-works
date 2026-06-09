'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users, Search, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react'

type Employee = {
  id: string
  employee_no: string
  first_name: string
  last_name: string
  location: string | null
  department_id: string | null
  category_id: string | null
  shift_id: string | null
  is_biometric_exempt: boolean
}

type Lookup = { id: string; name: string; code?: string | null }
type Shift = { id: string; name: string; start_time?: string; end_time?: string }

const KEEP = '__keep__'
const CLEAR = '__clear__'

export default function BulkAssignPage() {
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Lookup[]>([])
  const [categories, setCategories] = useState<Lookup[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState<string>('')
  const [filterCat, setFilterCat] = useState<string>('')
  const [filterShift, setFilterShift] = useState<string>('')
  const [filterLoc, setFilterLoc] = useState<string>('')

  // Selection (Set of employee IDs)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Assignment form
  const [assignDept, setAssignDept] = useState<string>(KEEP)
  const [assignCat, setAssignCat] = useState<string>(KEEP)
  const [assignShift, setAssignShift] = useState<string>(KEEP)
  const [reprocess, setReprocess] = useState(false)
  const [reprocessFrom, setReprocessFrom] = useState<string>('')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/employees/bulk-assignable', { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setForbidden(true); setLoading(false); return }
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load')
      setEmployees(data.employees || [])
      setDepartments(data.departments || [])
      setCategories(data.categories || [])
      setShifts(data.shifts || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  // Lookup helpers
  const deptMap = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const shiftMap = useMemo(() => new Map(shifts.map(s => [s.id, s])), [shifts])

  const NO_VALUE = '__none__'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter(e => {
      if (q) {
        const name = `${e.first_name} ${e.last_name}`.toLowerCase()
        if (!name.includes(q) && !e.employee_no.toLowerCase().includes(q)) return false
      }
      if (filterDept) {
        if (filterDept === NO_VALUE) { if (e.department_id) return false }
        else if (e.department_id !== filterDept) return false
      }
      if (filterCat) {
        if (filterCat === NO_VALUE) { if (e.category_id) return false }
        else if (e.category_id !== filterCat) return false
      }
      if (filterShift) {
        if (filterShift === NO_VALUE) { if (e.shift_id) return false }
        else if (e.shift_id !== filterShift) return false
      }
      if (filterLoc && e.location !== filterLoc) return false
      return true
    })
  }, [employees, search, filterDept, filterCat, filterShift, filterLoc])

  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selected.has(e.id))

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filtered.forEach(e => next.delete(e.id))
      } else {
        filtered.forEach(e => next.add(e.id))
      }
      return next
    })
  }

  function clearSelection() { setSelected(new Set()) }

  const hasAnyChange = assignDept !== KEEP || assignCat !== KEEP || assignShift !== KEEP

  function buildChangeSummary() {
    const changes: { field: string; label: string }[] = []
    if (assignDept !== KEEP) {
      changes.push({
        field: 'department',
        label: assignDept === CLEAR ? 'Clear department' : `Set department → ${deptMap.get(assignDept)?.name || '?'}`,
      })
    }
    if (assignCat !== KEEP) {
      changes.push({
        field: 'category',
        label: assignCat === CLEAR ? 'Clear category' : `Set category → ${catMap.get(assignCat)?.name || '?'}`,
      })
    }
    if (assignShift !== KEEP) {
      changes.push({
        field: 'shift',
        label: assignShift === CLEAR ? 'Clear shift' : `Set shift → ${shiftMap.get(assignShift)?.name || '?'}`,
      })
    }
    return changes
  }

  async function applyAssignment() {
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const body: any = { employee_ids: Array.from(selected) }
      if (assignDept !== KEEP) body.department_id = assignDept
      if (assignCat !== KEEP) body.category_id = assignCat
      if (assignShift !== KEEP) body.shift_id = assignShift
      if (reprocess && reprocessFrom) body.reprocess_from_date = reprocessFrom

      const r = await fetch('/api/employees/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setResult(data)
      setShowConfirm(false)
      setSelected(new Set())
      setAssignDept(KEEP); setAssignCat(KEEP); setAssignShift(KEEP)
      setReprocess(false); setReprocessFrom('')
      fetchData() // refresh data with new values
    } catch (e: any) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  if (forbidden) {
    return (
      <div className="p-8 text-center text-gray-600">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-500" />
        <div className="text-lg font-semibold">Access denied</div>
        <div className="text-sm mt-1">Restricted to Super Admin.</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-1 flex items-center gap-2">
        <Users className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Bulk Assign</h1>
      </div>
      <p className="text-sm text-gray-600 mb-5">
        Select employees and assign their department, category, and/or shift in one operation.
        All changes are audit-logged.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 text-green-800 font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            Updated {result.updated} employee{result.updated === 1 ? '' : 's'}
          </div>
          {result.reprocess && result.reprocess.length > 0 && (
            <div className="mt-2 text-sm text-green-700">
              Reprocessed {result.reprocess.filter((r: any) => r.ok).length} of {result.reprocess.length} dates.
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 p-4 rounded-2xl border bg-white">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Search</label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Name or employee no."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Department</label>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1">
              <option value="">All</option>
              <option value={NO_VALUE}>— No department —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Category</label>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1">
              <option value="">All</option>
              <option value={NO_VALUE}>— No category —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Shift</label>
            <select value={filterShift} onChange={e => setFilterShift(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1">
              <option value="">All</option>
              <option value={NO_VALUE}>— No shift —</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <label className="text-xs text-gray-600">Location:</label>
          {['', 'Factory', 'Showroom', 'Site'].map(loc => (
            <label key={loc} className="text-sm flex items-center gap-1">
              <input type="radio" checked={filterLoc === loc} onChange={() => setFilterLoc(loc)} />
              {loc || 'All'}
            </label>
          ))}
        </div>
      </div>

      {/* Employee list */}
      <div className="mb-4 p-4 rounded-2xl border bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm">
            <span className="font-semibold">{filtered.length}</span> employee{filtered.length === 1 ? '' : 's'} shown
            {selected.size > 0 && (
              <span className="ml-3 text-[#1D9E75] font-semibold">
                {selected.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <button onClick={clearSelection}
                className="text-xs text-gray-600 hover:text-gray-900 underline">
                Clear selection
              </button>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                disabled={filtered.length === 0} />
              Select all visible
            </label>
          </div>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm py-4">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 text-sm py-4 text-center">No employees match these filters.</div>
        ) : (
          <div className="border rounded-lg max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-xs text-gray-600">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Shift</th>
                  <th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const isSelected = selected.has(e.id)
                  const d = e.department_id ? deptMap.get(e.department_id) : null
                  const c = e.category_id ? catMap.get(e.category_id) : null
                  const s = e.shift_id ? shiftMap.get(e.shift_id) : null
                  return (
                    <tr key={e.id}
                      className={`border-t cursor-pointer ${isSelected ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggleSelect(e.id)}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={isSelected} readOnly />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{e.first_name} {e.last_name}</div>
                        <div className="text-xs text-gray-500">{e.employee_no}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{d?.name ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-gray-700">{c?.name ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-gray-700">{s?.name ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 text-gray-700">{e.location ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assignment panel */}
      {selected.size > 0 && (
        <div className="p-4 rounded-2xl border bg-white sticky bottom-4 shadow-lg">
          <h3 className="font-semibold mb-2">
            Assign to {selected.size} employee{selected.size === 1 ? '' : 's'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-600">Department</label>
              <select value={assignDept} onChange={e => setAssignDept(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm mt-1">
                <option value={KEEP}>— Keep current —</option>
                <option value={CLEAR}>— Clear (set to none) —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Category</label>
              <select value={assignCat} onChange={e => setAssignCat(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm mt-1">
                <option value={KEEP}>— Keep current —</option>
                <option value={CLEAR}>— Clear (set to none) —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Shift</label>
              <select value={assignShift} onChange={e => setAssignShift(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm mt-1">
                <option value={KEEP}>— Keep current —</option>
                <option value={CLEAR}>— Clear (set to none) —</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-start gap-3 mb-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
            <input type="checkbox" checked={reprocess} onChange={e => setReprocess(e.target.checked)}
              className="mt-1" />
            <div className="flex-1">
              <label className="text-sm font-medium text-yellow-900">
                Also reprocess past attendance with new rules
              </label>
              <p className="text-xs text-yellow-800 mt-0.5">
                Re-runs the attendance processor from this date through today.
                Use if you want past red marks recalculated with the new shift/category.
              </p>
              {reprocess && (
                <input type="date" value={reprocessFrom}
                  onChange={e => setReprocessFrom(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="mt-2 px-3 py-1.5 border rounded-lg text-sm" />
              )}
            </div>
          </div>

          {hasAnyChange ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#1D9E75] text-white font-medium hover:bg-[#168a64] disabled:opacity-50 flex items-center gap-2"
            >
              Preview & Apply <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <p className="text-sm text-gray-500">Choose at least one field to change.</p>
          )}
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-1">Confirm bulk assignment</h2>
            <p className="text-sm text-gray-600 mb-4">
              The following changes will apply to <strong>{selected.size}</strong> employee{selected.size === 1 ? '' : 's'}:
            </p>
            <ul className="space-y-1 text-sm mb-4 pl-4">
              {buildChangeSummary().map((c, i) => (
                <li key={i} className="list-disc text-gray-800">{c.label}</li>
              ))}
            </ul>
            {reprocess && reprocessFrom && (
              <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-900 mb-4">
                Attendance will be reprocessed from <strong>{reprocessFrom}</strong> through today.
                This may take ~5-15 seconds.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} disabled={submitting}
                className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={applyAssignment} disabled={submitting}
                className="px-4 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#168a64] disabled:opacity-50 flex items-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</> : 'Confirm Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
