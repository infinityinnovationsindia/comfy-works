
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewOTPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedEmps, setSelectedEmps] = useState<any[]>([])
  const [form, setForm] = useState({ project_site:'', date_requested: new Date().toISOString().split('T')[0], date_of_ot:'', time_from:'17:00', time_to:'20:00' })
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    fetch('/api/employees').then(r=>r.json()).then(d => setEmployees(d.filter((e:any)=>e.status==='Active')))
    fetch('/api/auth/me').then(r=>r.json()).then(d=>setMe(d))
  }, [])

  const plannedHours = (() => {
    if (!form.time_from || !form.time_to) return 0
    const [fh,fm] = form.time_from.split(':').map(Number)
    const [th,tm] = form.time_to.split(':').map(Number)
    return Math.max(0,((th*60+tm)-(fh*60+fm))/60)
  })()

  function addEmployee(emp: any) {
    if (!selectedEmps.find(e=>e.employee_id===emp.id)) {
      setSelectedEmps(prev=>[...prev,{employee_id:emp.id,name:`${emp.first_name} ${emp.last_name}`,employee_no:emp.employee_no,remark:''}])
    }
  }

  async function submit() {
    if (!form.project_site || !form.date_of_ot || selectedEmps.length===0) {
      alert('Please fill all fields and add at least one employee')
      return
    }
    setSaving(true)
    const res = await fetch('/api/overtime',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...form, employees:selectedEmps, raised_by:me?.id})
    })
    if (res.ok) { router.push('/overtime') }
    else { alert('Failed to submit'); setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Overtime Request</h1>

      <div className="bg-white border rounded-xl p-6 space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Site *</label>
          <input value={form.project_site} onChange={e=>setForm(p=>({...p,project_site:e.target.value}))}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Satellite Showroom, Bodakdev Villa"/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Requested</label>
            <input type="date" value={form.date_requested} onChange={e=>setForm(p=>({...p,date_requested:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of OT *</label>
            <input type="date" value={form.date_of_ot} onChange={e=>setForm(p=>({...p,date_of_ot:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Time</label>
            <input type="time" value={form.time_from} onChange={e=>setForm(p=>({...p,time_from:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Time</label>
            <input type="time" value={form.time_to} onChange={e=>setForm(p=>({...p,time_to:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
          Planned OT Hours: <strong>{plannedHours.toFixed(1)} hrs</strong>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 mb-6">
        <h2 className="font-medium mb-3">Add Employees ({selectedEmps.length}/10)</h2>
        <select className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
          onChange={e=>{const emp=employees.find(x=>x.id===e.target.value);if(emp)addEmployee(emp);e.target.value=''}}>
          <option value="">-- Select employee to add --</option>
          {employees.map(e=>(
            <option key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</option>
          ))}
        </select>
        {selectedEmps.length > 0 && (
          <div className="space-y-2">
            {selectedEmps.map((emp,i)=>(
              <div key={emp.employee_id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium w-24">{emp.employee_no}</span>
                <span className="text-sm flex-1">{emp.name}</span>
                <input value={emp.remark} onChange={e=>{const copy=[...selectedEmps];copy[i].remark=e.target.value;setSelectedEmps(copy)}}
                  placeholder="Remark" className="border rounded px-2 py-1 text-xs w-32"/>
                <button onClick={()=>setSelectedEmps(prev=>prev.filter(x=>x.employee_id!==emp.employee_id))}
                  className="text-red-500 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={submit} disabled={saving}
        className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
        {saving ? 'Submitting...' : 'Submit OT Request → Shailoo Patel for approval'}
      </button>
    </div>
  )
}
