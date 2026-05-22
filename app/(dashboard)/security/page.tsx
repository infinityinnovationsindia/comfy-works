
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function SecurityDashboard() {
  const [data, setData] = useState<any>({ timeOff:[], onDuty:[], workPerms:[], visitors:[], vehicles:[] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('passes')
  const today = new Date().toISOString().split('T')[0]

  useEffect(()=>{
    Promise.all([
      fetch(`/api/time-off?date=${today}&status=Approved`).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/on-duty?date=${today}&status=Approved`).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/work-permission?date=${today}&status=Approved`).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/visitors?date=${today}`).then(r=>r.json()).catch(()=>[]),
      fetch(`/api/vehicles?month=${today.slice(0,7)}`).then(r=>r.json()).catch(()=>[]),
    ]).then(([timeOff,onDuty,workPerms,visitors,vehicles])=>{
      setData({ timeOff:Array.isArray(timeOff)?timeOff:[], onDuty:Array.isArray(onDuty)?onDuty:[], workPerms:Array.isArray(workPerms)?workPerms:[], visitors:Array.isArray(visitors)?visitors:[], vehicles:Array.isArray(vehicles)?vehicles.filter((v:any)=>v.date===today):[] })
      setLoading(false)
    })
  },[])

  const tabs = [
    {key:'passes',label:'Time Off',count:data.timeOff.length},
    {key:'onduty',label:'On Duty',count:data.onDuty.length},
    {key:'afterhours',label:'After Hours',count:data.workPerms.length},
    {key:'visitors',label:'Visitors',count:data.visitors.filter((v:any)=>!v.time_out).length},
    {key:'vehicles',label:'Vehicles',count:data.vehicles.length},
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">COMFY — Security Gate</h1>
          <p className="text-gray-400 text-sm">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</p>
        </div>
        <Link href="/visitors/new" className="px-4 py-3 bg-green-600 rounded-xl text-sm font-bold">
          + VISITOR
        </Link>
      </div>

      {/* Tab bar — large touch targets */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium ${tab===t.key?'bg-green-600':'bg-gray-800'}`}>
            {t.label} {t.count>0&&<span className="ml-1 bg-white text-gray-900 rounded-full px-1.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading?<div className="text-center py-12 text-gray-500">Loading...</div>:(
        <>
          {/* TIME OFF PASSES */}
          {tab==='passes' && (
            <div className="space-y-3">
              {data.timeOff.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No time-off passes today</div>}
              {data.timeOff.map((p:any)=>(
                <div key={p.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="text-lg font-bold">{p.employee?.first_name} {p.employee?.last_name}</div>
                  <div className="text-gray-400 text-sm">{p.employee?.employee_no}</div>
                  <div className="mt-2 text-green-400 font-medium">OUT: {p.time_out}</div>
                  <div className="text-gray-300 text-sm mt-1">Purpose: {p.purpose}</div>
                  {p.time_in_actual&&<div className="text-blue-400 text-sm mt-1">RETURNED: {p.time_in_actual}</div>}
                </div>
              ))}
            </div>
          )}

          {/* ON DUTY */}
          {tab==='onduty' && (
            <div className="space-y-3">
              {data.onDuty.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No on-duty passes today</div>}
              {data.onDuty.map((od:any)=>(
                <div key={od.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="text-lg font-bold">{od.employee?.first_name} {od.employee?.last_name}</div>
                  <div className="text-gray-400 text-sm">{od.employee?.employee_no}</div>
                  <div className="mt-2 text-green-400 font-medium">OUT: {od.time_out} → IN: {od.time_in_planned}</div>
                  <div className="text-gray-300 text-sm mt-1">To: {od.location_to_visit}</div>
                  <div className="text-gray-300 text-sm">Vehicle: {od.vehicle_type} {od.vehicle_number&&`(${od.vehicle_number})`}</div>
                  {od.outward_km&&<div className="text-gray-400 text-xs mt-1">ODO Out: {od.outward_km}</div>}
                </div>
              ))}
            </div>
          )}

          {/* AFTER HOURS WORK PERMISSION */}
          {tab==='afterhours' && (
            <div className="space-y-3">
              {data.workPerms.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No after-hours permissions today</div>}
              {data.workPerms.map((wp:any)=>(
                <div key={wp.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="text-green-400 font-bold text-lg">APPROVED — Work Permission</div>
                  <div className="text-gray-300 mt-1">{wp.time_from} – {wp.time_to}</div>
                  {wp.project_site&&<div className="text-gray-400 text-sm">Site: {wp.project_site}</div>}
                  <div className="text-gray-400 text-sm">SIP/PIP: {wp.sip_pip}</div>
                  <div className="mt-3 space-y-1">
                    {wp.work_permission_employees?.map((e:any)=>(
                      <div key={e.id} className="flex items-center gap-2 text-sm">
                        <span className="w-16 text-gray-500">{e.employee?.employee_no}</span>
                        <span>{e.employee?.first_name} {e.employee?.last_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VISITORS */}
          {tab==='visitors' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Active: {data.visitors.filter((v:any)=>!v.time_out).length} · Total today: {data.visitors.length}</span>
                <Link href="/visitors/new" className="px-3 py-2 bg-green-600 rounded-lg text-sm">+ Register</Link>
              </div>
              {data.visitors.map((v:any)=>(
                <div key={v.id} className={`rounded-xl p-4 ${v.time_out?'bg-gray-900 border border-gray-700':'bg-gray-800'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold">{v.name}</div>
                      <div className="text-gray-400 text-sm">{v.company}</div>
                      <div className="text-gray-300 text-sm mt-1">→ {v.host?.first_name} {v.host?.last_name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        IN: {new Date(v.time_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}
                        {v.time_out&&` · OUT: ${new Date(v.time_out).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}`}
                      </div>
                    </div>
                    {!v.time_out&&(
                      <button onClick={async()=>{await fetch(`/api/visitors/${v.id}/checkout`,{method:'POST'});window.location.reload()}}
                        className="px-3 py-2 bg-gray-600 rounded-lg text-sm">Log Exit</button>
                    )}
                  </div>
                </div>
              ))}
              {data.visitors.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No visitors today</div>}
            </div>
          )}

          {/* VEHICLES */}
          {tab==='vehicles' && (
            <div className="space-y-3">
              <Link href="/vehicles/new" className="block text-center py-3 bg-gray-800 rounded-xl text-sm text-green-400">+ Log New Trip</Link>
              {data.vehicles.map((v:any)=>(
                <div key={v.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div className="font-bold">{v.vehicle==='TATA_407'?'TATA 407':'Piaggio'}</div>
                    {!v.time_in&&<span className="bg-orange-500 text-white text-xs px-2 py-1 rounded">OUT</span>}
                    {v.time_in&&<span className="bg-green-600 text-white text-xs px-2 py-1 rounded">RETURNED</span>}
                  </div>
                  <div className="text-gray-400 text-sm mt-1">Out: {v.time_out||'—'} · In: {v.time_in||'—'}</div>
                  <div className="text-gray-400 text-sm">ODO: {v.odometer_out} → {v.odometer_in||'pending'}</div>
                  {v.total_km>0&&<div className="text-green-400 text-sm font-medium">{v.total_km} KM total</div>}
                </div>
              ))}
              {data.vehicles.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No vehicle trips today</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
