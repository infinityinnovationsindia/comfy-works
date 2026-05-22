
'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function OTDetailPage() {
  const { id } = useParams()
  const [ot, setOt] = useState<any>(null)
  const [me, setMe] = useState<any>(null)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    fetch(`/api/overtime?id=${id}`).then(r=>r.json()).then(d=>setOt(Array.isArray(d)?d.find((x:any)=>x.id===id):d))
    fetch('/api/auth/me').then(r=>r.json()).then(setMe)
  }, [id])

  async function act(action: string) {
    setActing(true)
    const role = me?.employee_no === 'CF-002' ? 'shailoo' : me?.employee_no === 'CF-004' ? 'kush' : null
    if (!role) { alert('You are not an approver for this request'); setActing(false); return }
    await fetch(`/api/overtime/${id}/approve`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ approver_id: me.id, approver_role: role, action })
    })
    window.location.reload()
  }

  if (!ot) return <div className="p-6 text-gray-400">Loading...</div>

  const canApprove = (me?.employee_no === 'CF-002' && ot.status === 'Pending') ||
                     (me?.employee_no === 'CF-004' && ot.status === 'Shailoo_Approved')

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Overtime Request</h1>
      <p className="text-sm text-gray-500 mb-6">{ot.project_site} · {new Date(ot.date_of_ot).toLocaleDateString('en-IN')}</p>

      <div className="bg-white border rounded-xl p-6 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Date of OT</span><div className="font-medium">{new Date(ot.date_of_ot).toLocaleDateString('en-IN')}</div></div>
          <div><span className="text-gray-500">Time</span><div className="font-medium">{ot.time_from} – {ot.time_to}</div></div>
          <div><span className="text-gray-500">Planned Hours</span><div className="font-medium">{ot.planned_hours?.toFixed(1)} hrs</div></div>
          <div><span className="text-gray-500">Status</span><div className="font-medium">{ot.status.replace('_',' ')}</div></div>
          <div><span className="text-gray-500">Raised By</span><div className="font-medium">{ot.raised_by_emp?.first_name} {ot.raised_by_emp?.last_name}</div></div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 mb-4">
        <h2 className="font-medium mb-3">Employees ({ot.overtime_employees?.length})</h2>
        <div className="divide-y">
          {ot.overtime_employees?.map((e:any,i:number)=>(
            <div key={e.id} className="py-2 flex items-center justify-between text-sm">
              <span>{i+1}. {e.employee?.first_name} {e.employee?.last_name}</span>
              <span className="text-gray-400">{e.employee?.employee_no}</span>
              {e.remark && <span className="text-gray-400 text-xs">{e.remark}</span>}
            </div>
          ))}
        </div>
      </div>

      {canApprove && (
        <div className="flex gap-3">
          <button onClick={()=>act('approve')} disabled={acting}
            className="flex-1 py-3 bg-green-700 text-white rounded-xl font-medium">
            ✓ Approve
          </button>
          <button onClick={()=>act('reject')} disabled={acting}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium">
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  )
}
