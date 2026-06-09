'use client'

import { useEffect, useState } from 'react'
import { Tag, Plus, Pencil, Trash2, Users, Info } from 'lucide-react'

type Category = {
  id: string
  name: string
  code: string | null
  late_grace_minutes: number
  early_grace_minutes: number
  half_day_if_hours_below: number
  absent_if_hours_below: number
  late_threshold_hours: number
  early_threshold_hours: number
  half_day_unpaid: boolean
  holiday_paid: boolean
  ot_rounding: string
  is_active: boolean
  employee_count: number
}

const DEFAULT_FORM: Partial<Category> = {
  name: '',
  code: '',
  late_grace_minutes: 0,
  early_grace_minutes: 0,
  half_day_if_hours_below: 0,
  absent_if_hours_below: 0,
  late_threshold_hours: 1,
  early_threshold_hours: 1,
  half_day_unpaid: true,
  holiday_paid: true,
  ot_rounding: 'none',
  is_active: true,
}

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState<Partial<Category>>(DEFAULT_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Category>>({})

  async function fetchCats() {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/categories', { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setForbidden(true); setLoading(false); return }
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load')
      setCats(data.categories || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCats() }, [])

  async function createCat() {
    if (!newForm.name?.trim()) return setError('Name is required')
    setError(null)
    try {
      const r = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setNewForm(DEFAULT_FORM); setShowNew(false); fetchCats()
    } catch (e: any) { setError(e.message) }
  }

  async function saveEdit(id: string) {
    setError(null)
    try {
      const r = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setEditingId(null); setEditForm({}); fetchCats()
    } catch (e: any) { setError(e.message) }
  }

  async function deleteCat(c: Category) {
    if (c.employee_count > 0) {
      if (!confirm(`${c.employee_count} employee(s) are in "${c.name}". Their category will be cleared (not deleted). Continue?`)) return
    } else {
      if (!confirm(`Delete category "${c.name}"?`)) return
    }
    setError(null)
    try {
      const r = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      fetchCats()
    } catch (e: any) { setError(e.message) }
  }

  if (forbidden) {
    return (
      <div className="p-8 text-center text-gray-600">
        <div className="text-lg font-semibold">Access denied</div>
        <div className="text-sm mt-1">Restricted to Super Admin.</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tag className="w-6 h-6" /> Categories
        </h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#168a64]"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-5">
        Categories define <strong>how each employee class is judged</strong> — grace periods, half-day thresholds, pay policy.
        Used by the attendance processor to compute red marks and statuses.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {showNew && (
        <div className="mb-4 p-4 rounded-2xl border bg-white">
          <h3 className="font-semibold mb-3">New Category</h3>
          <CategoryForm form={newForm} setForm={setNewForm} />
          <div className="flex gap-2 mt-3">
            <button onClick={createCat}
              className="px-3 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#168a64]">
              Create
            </button>
            <button onClick={() => { setShowNew(false); setNewForm(DEFAULT_FORM); setError(null) }}
              className="px-3 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : cats.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border rounded-2xl bg-white">
          <Info className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          No categories yet. Create categories like <em>Manager, Workers, Drivers, Cleaner</em> with their grace periods and rules.
          <br />The processor falls back to default rules (no grace, half-day if &lt;5hrs) until employees are assigned.
        </div>
      ) : (
        <div className="space-y-2">
          {cats.map(c => (
            <div key={c.id} className={`p-4 rounded-2xl border bg-white ${!c.is_active ? 'opacity-50' : ''}`}>
              {editingId === c.id ? (
                <div className="space-y-3">
                  <CategoryForm
                    form={{ ...c, ...editForm }}
                    setForm={(v) => setEditForm(typeof v === 'function' ? v(editForm) : v)}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(c.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#168a64]">
                      Save
                    </button>
                    <button onClick={() => { setEditingId(null); setEditForm({}) }}
                      className="px-3 py-1.5 rounded-lg border text-sm font-medium hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      {c.code && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-mono">{c.code}</span>}
                      {!c.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                      <div>Late grace: <span className="font-medium text-gray-900">{c.late_grace_minutes} min</span></div>
                      <div>Early grace: <span className="font-medium text-gray-900">{c.early_grace_minutes} min</span></div>
                      <div>Half-day if &lt; <span className="font-medium text-gray-900">{c.half_day_if_hours_below} hrs</span></div>
                      <div>Absent if &lt; <span className="font-medium text-gray-900">{c.absent_if_hours_below} hrs</span></div>
                      <div>Half-day unpaid: <span className="font-medium text-gray-900">{c.half_day_unpaid ? 'Yes' : 'No'}</span></div>
                      <div>Holiday paid: <span className="font-medium text-gray-900">{c.holiday_paid ? 'Yes' : 'No'}</span></div>
                      <div>OT rounding: <span className="font-medium text-gray-900">{c.ot_rounding}</span></div>
                      <div className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.employee_count} employee{c.employee_count === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-3">
                    <button onClick={() => { setEditingId(c.id); setEditForm({}) }}
                      className="p-2 rounded-lg hover:bg-gray-100" title="Edit">
                      <Pencil className="w-4 h-4 text-gray-600" />
                    </button>
                    <button onClick={() => deleteCat(c)}
                      className="p-2 rounded-lg hover:bg-red-50" title="Delete">
                      <Trash2 className="w-4 h-4 text-red-600" />
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

function CategoryForm({ form, setForm }: {
  form: Partial<Category>
  setForm: (v: Partial<Category> | ((p: Partial<Category>) => Partial<Category>)) => void
}) {
  const update = (patch: Partial<Category>) =>
    setForm((p: Partial<Category>) => ({ ...p, ...patch }))

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-600">Name *</label>
          <input value={form.name ?? ''} onChange={e => update({ name: e.target.value })}
            placeholder="e.g. Workers"
            className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
        </div>
        <div>
          <label className="text-xs text-gray-600">Code (short)</label>
          <input value={form.code ?? ''} onChange={e => update({ code: e.target.value })}
            placeholder="e.g. WKR"
            className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active ?? true}
              onChange={e => update({ is_active: e.target.checked })} />
            Active
          </label>
        </div>
      </div>

      {/* Grace periods */}
      <div>
        <div className="text-xs font-semibold text-gray-700 mb-2">Grace Periods (minutes)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600">Late arrival grace</label>
            <input type="number" min="0" value={form.late_grace_minutes ?? 0}
              onChange={e => update({ late_grace_minutes: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
            <p className="text-xs text-gray-500 mt-0.5">Minutes before red marks start counting</p>
          </div>
          <div>
            <label className="text-xs text-gray-600">Early leave grace</label>
            <input type="number" min="0" value={form.early_grace_minutes ?? 0}
              onChange={e => update({ early_grace_minutes: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* Hours thresholds */}
      <div>
        <div className="text-xs font-semibold text-gray-700 mb-2">Hours Thresholds (set 0 to disable)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600">Mark half-day if hours below</label>
            <input type="number" step="0.5" min="0" value={form.half_day_if_hours_below ?? 0}
              onChange={e => update({ half_day_if_hours_below: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-600">Mark absent if hours below</label>
            <input type="number" step="0.5" min="0" value={form.absent_if_hours_below ?? 0}
              onChange={e => update({ absent_if_hours_below: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
          </div>
        </div>
      </div>

      {/* Policy */}
      <div>
        <div className="text-xs font-semibold text-gray-700 mb-2">Policy</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.half_day_unpaid ?? true}
              onChange={e => update({ half_day_unpaid: e.target.checked })} />
            Half-day deducted as unpaid
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.holiday_paid ?? true}
              onChange={e => update({ holiday_paid: e.target.checked })} />
            Holidays are paid
          </label>
          <div>
            <label className="text-xs text-gray-600">OT rounding</label>
            <select value={form.ot_rounding ?? 'none'}
              onChange={e => update({ ot_rounding: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm mt-1">
              <option value="none">None</option>
              <option value="down_15">Round down to 15 min</option>
              <option value="down_30">Round down to 30 min</option>
              <option value="nearest_15">Nearest 15 min</option>
              <option value="nearest_30">Nearest 30 min</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
