
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewWorkPermPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedEmps, setSelectedEmps] = useState<any[]>([])
  const [form, setForm] = useState({ project_site:'', date_requested: new Date().toISOString().split('T')[0], date_of_work:'', time_from:'18:00', time_to:'21:00', sip_pip:'N/A' })
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    fetch('/api/employees/simple').then(r=>r.json()).then(d=>setEmployees(d.employees || []))
    fetch('/api/auth/me').then(r=>r.json()).then(setMe)
  },[])

  async function submit() {
    if (!form.date_of_work || selectedEmps.length===0) { alert('Please fill date and add employees'); return }
    setSaving(true)
    const res = await fetch('/api/work-permission',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({...form, employees:selectedEmps, raised_by:me?.id})
    })
    if (res.ok) router.push('/work-permission')
    else { alert('Failed'); setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Work Permission Request</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4 mb-6">
        <div><label className="block text-sm font-medium mb-1">Project Site</label>
          <input value={form.project_site} onChange={e=>setForm(p=>({...p,project_site:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional"/></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Date of Work *</label>
            <input type="date" value={form.date_of_work} onChange={e=>setForm(p=>({...p,date_of_work:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
          <div><label className="block text-sm font-medium mb-1">SIP / PIP</label>
            <select value={form.sip_pip} onChange={e=>setForm(p=>({...p,sip_pip:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option>N/A</option><option>SIP</option><option>PIP</option>
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">From</label>
            <input type="time" value={form.time_from} onChange={e=>setForm(p=>({...p,time_from:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
          <div><label className="block text-sm font-medium mb-1">To</label>
            <input type="time" value={form.time_to} onChange={e=>setForm(p=>({...p,time_to:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        </div>
      </div>
      <div className="bg-white border rounded-xl p-6 mb-6">
        <h2 className="font-medium mb-3">Add Employees</h2>
        <select className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
          onChange={e=>{const emp=employees.find(x=>x.id===e.target.value);if(emp&&!selectedEmps.find(s=>s.employee_id===emp.id))setSelectedEmps(prev=>[...prev,{employee_id:emp.id,name:`${emp.first_name} ${emp.last_name}`,employee_no:emp.employee_no}]);e.target.value=''}}>
          <option value="">-- Add employee --</option>
          {employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</option>)}
        </select>
        {selectedEmps.map(emp=>(
          <div key={emp.employee_id} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2 mb-2 text-sm">
            <span className="font-medium">{emp.employee_no}</span>
            <span className="flex-1">{emp.name}</span>
            <button onClick={()=>setSelectedEmps(prev=>prev.filter(x=>x.employee_id!==emp.employee_id))} className="text-red-500">✕</button>
          </div>
        ))}
      </div>
      <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
        {saving?'Submitting...':'Submit → Kush Patel for approval'}
      </button>
    </div>
  )
}
