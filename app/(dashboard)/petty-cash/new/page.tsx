
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const DEPARTMENTS = ['Factory','Showroom','Site','Admin','Design','Accounts']

export default function NewPettyCashPage() {
  const router = useRouter()
  const [form, setForm] = useState({ department:'Factory', amount:'', purpose:'' })
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(()=>{fetch('/api/auth/me').then(r=>r.json()).then(setMe)},[])

  async function submit() {
    if(!form.amount||!form.purpose){alert('Fill all fields');return}
    setSaving(true)
    const res = await fetch('/api/petty-cash',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...form,amount:Number(form.amount),employee_id:me?.id})})
    if(res.ok)router.push('/petty-cash')
    else{alert('Failed');setSaving(false)}
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">New Petty Cash Request</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Department</label>
          <select value={form.department} onChange={e=>setForm(p=>({...p,department:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
            {DEPARTMENTS.map(d=><option key={d}>{d}</option>)}
          </select></div>
        <div><label className="block text-sm font-medium mb-1">Amount (₹) *</label>
          <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 500"/></div>
        <div><label className="block text-sm font-medium mb-1">Purpose *</label>
          <textarea value={form.purpose} onChange={e=>setForm(p=>({...p,purpose:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm h-24" placeholder="Describe what this cash will be used for"/></div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Request will be sent to Kiran Patel & Neal Patel for approval.
        </div>
        <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
          {saving?'Submitting...':'Submit Request'}
        </button>
      </div>
    </div>
  )
}
