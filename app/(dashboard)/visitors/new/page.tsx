
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewVisitorPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({ name:'', company:'', purpose:'', host_employee_id:'', id_proof_type:'Aadhaar', id_proof_number:'', security_notes:'' })
  const [saving, setSaving] = useState(false)

  useEffect(()=>{fetch('/api/employees/simple').then(r=>r.json()).then(d=>setEmployees(d.employees || []))},[])

  async function submit() {
    if(!form.name||!form.purpose||!form.host_employee_id){alert('Name, purpose and host are required');return}
    setSaving(true)
    const res = await fetch('/api/visitors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    if(res.ok)router.push('/visitors')
    else{alert('Failed');setSaving(false)}
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">Register Visitor</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Visitor Name *</label>
          <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Full name"/></div>
        <div><label className="block text-sm font-medium mb-1">Company / Organisation</label>
          <input value={form.company} onChange={e=>setForm(p=>({...p,company:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        <div><label className="block text-sm font-medium mb-1">Purpose of Visit *</label>
          <input value={form.purpose} onChange={e=>setForm(p=>({...p,purpose:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        <div><label className="block text-sm font-medium mb-1">Whom to Meet *</label>
          <select value={form.host_employee_id} onChange={e=>setForm(p=>({...p,host_employee_id:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">-- Select employee --</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_no})</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">ID Proof Type</label>
            <select value={form.id_proof_type} onChange={e=>setForm(p=>({...p,id_proof_type:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option>Aadhaar</option><option>PAN</option><option>Driving Licence</option><option>Voter ID</option><option>Passport</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">ID Number</label>
            <input value={form.id_proof_number} onChange={e=>setForm(p=>({...p,id_proof_number:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Security Notes</label>
          <textarea value={form.security_notes} onChange={e=>setForm(p=>({...p,security_notes:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm h-20" placeholder="Optional"/></div>
        <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
          {saving?'Registering...':'Register & Notify Host'}
        </button>
      </div>
    </div>
  )
}
