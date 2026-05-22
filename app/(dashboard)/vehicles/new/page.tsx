
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewTripPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({ vehicle:'TATA_407', date:new Date().toISOString().split('T')[0], time_out:'', odometer_out:'' })
  const [legs, setLegs] = useState([{destination:'',ref_no:'',remark:'',accompanying_employee_id:''}])
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(()=>{
    fetch('/api/employees').then(r=>r.json()).then(setEmployees)
    fetch('/api/auth/me').then(r=>r.json()).then(setMe)
  },[])

  async function submit() {
    if (!form.time_out||!form.odometer_out){alert('Fill time out and odometer');return}
    setSaving(true)
    const res = await fetch('/api/vehicles',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...form,odometer_out:Number(form.odometer_out),legs,approved_by:me?.id})})
    if(res.ok)router.push('/vehicles')
    else{alert('Failed');setSaving(false)}
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Log Vehicle Trip</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Vehicle</label>
            <select value={form.vehicle} onChange={e=>setForm(p=>({...p,vehicle:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="TATA_407">TATA 407</option>
              <option value="Piaggio">Piaggio</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Date</label>
            <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Time Out *</label>
            <input type="time" value={form.time_out} onChange={e=>setForm(p=>({...p,time_out:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
          <div><label className="block text-sm font-medium mb-1">Odometer Out *</label>
            <input type="number" value={form.odometer_out} onChange={e=>setForm(p=>({...p,odometer_out:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 45230"/></div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Trip Stops / Destinations</h2>
          <button onClick={()=>setLegs(p=>[...p,{destination:'',ref_no:'',remark:'',accompanying_employee_id:''}])}
            className="text-sm text-green-700">+ Add Stop</button>
        </div>
        {legs.map((leg,i)=>(
          <div key={i} className="border rounded-lg p-3 mb-3 space-y-2">
            <div className="flex gap-2">
              <input value={leg.destination} onChange={e=>{const c=[...legs];c[i].destination=e.target.value;setLegs(c)}}
                placeholder="Destination *" className="flex-1 border rounded px-2 py-1.5 text-sm"/>
              <input value={leg.ref_no} onChange={e=>{const c=[...legs];c[i].ref_no=e.target.value;setLegs(c)}}
                placeholder="Ref No." className="w-28 border rounded px-2 py-1.5 text-sm"/>
            </div>
            <div className="flex gap-2">
              <select value={leg.accompanying_employee_id} onChange={e=>{const c=[...legs];c[i].accompanying_employee_id=e.target.value;setLegs(c)}}
                className="flex-1 border rounded px-2 py-1.5 text-sm">
                <option value="">Driver only</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
              {legs.length>1&&<button onClick={()=>setLegs(prev=>prev.filter((_,j)=>j!==i))} className="text-red-500 text-sm">Remove</button>}
            </div>
          </div>
        ))}
      </div>

      <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
        {saving?'Saving...':'Log Trip Departure'}
      </button>
    </div>
  )
}
