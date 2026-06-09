'use client'

import { useEffect, useState } from 'react'
import { Building2, Plus, Pencil, Trash2, Users } from 'lucide-react'

type Department = {
  id: string
  name: string
  code: string | null
  description: string | null
  is_active: boolean
  employee_count: number
}

export default function DepartmentsPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  // New form state
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newDesc, setNewDesc] = useState('')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Department>>({})

  async function fetchDepts() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/departments', { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setForbidden(true); setLoading(false); return }
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load')
      setDepts(data.departments || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchDepts() }, [])

  async function createDept() {
    if (!newName.trim()) return setError('Name is required')
    setError(null)
    try {
      const r = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, code: newCode, description: newDesc }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setNewName(''); setNewCode(''); setNewDesc(''); setShowNew(false)
      fetchDepts()
    } catch (e: any) { setError(e.message) }
  }

  async function saveEdit(id: string) {
    setError(null)
    try {
      const r = await fetch(`/api/departments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setEditingId(null); setEditForm({}); fetchDepts()
    } catch (e: any) { setError(e.message) }
  }

  async function deleteDept(d: Department) {
    if (d.employee_count > 0) {
      if (!confirm(`${d.employee_count} employee(s) are in "${d.name}". Their department will be cleared (not deleted). Continue?`)) return
    } else {
      if (!confirm(`Delete department "${d.name}"?`)) return
    }
    setError(null)
    try {
      const r = await fetch(`/api/departments/${d.id}`, { method: 'DELETE' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      fetchDepts()
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
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6" /> Departments
        </h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#168a64]"
        >
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-5">
        Org groupings for employees. Used for reporting and bulk operations.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {showNew && (
        <div className="mb-4 p-4 rounded-2xl border bg-white">
          <h3 className="font-semibold mb-3">New Department</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Production"
                className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Code (short)</label>
              <input value={newCode} onChange={e => setNewCode(e.target.value)}
                placeholder="e.g. PROD"
                className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Description</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="What this department covers"
                className="w-full px-3 py-2 border rounded-lg text-sm mt-1" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={createDept}
              className="px-3 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#168a64]">
              Create
            </button>
            <button onClick={() => { setShowNew(false); setError(null) }}
              className="px-3 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : depts.length === 0 ? (
        <div className="p-8 text-center text-gray-500 border rounded-2xl bg-white">
          No departments yet. Click "Add Department" to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {depts.map(d => (
            <div key={d.id} className={`p-4 rounded-2xl border bg-white ${!d.is_active ? 'opacity-50' : ''}`}>
              {editingId === d.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input value={editForm.name ?? d.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="px-3 py-2 border rounded-lg text-sm" placeholder="Name" />
                    <input value={editForm.code ?? d.code ?? ''}
                      onChange={e => setEditForm({ ...editForm, code: e.target.value })}
                      className="px-3 py-2 border rounded-lg text-sm" placeholder="Code" />
                    <input value={editForm.description ?? d.description ?? ''}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                      className="px-3 py-2 border rounded-lg text-sm md:col-span-2" placeholder="Description" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={editForm.is_active ?? d.is_active}
                        onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} />
                      Active
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(d.id)}
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
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{d.name}</span>
                      {d.code && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-mono">{d.code}</span>}
                      {!d.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                    </div>
                    {d.description && <p className="text-sm text-gray-600 mt-0.5">{d.description}</p>}
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Users className="w-3 h-3" /> {d.employee_count} employee{d.employee_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingId(d.id); setEditForm({}) }}
                      className="p-2 rounded-lg hover:bg-gray-100" title="Edit">
                      <Pencil className="w-4 h-4 text-gray-600" />
                    </button>
                    <button onClick={() => deleteDept(d)}
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
