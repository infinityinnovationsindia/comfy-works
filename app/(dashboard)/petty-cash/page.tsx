
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function PettyCashPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Pending')

  useEffect(()=>{
    fetch(`/api/petty-cash?status=${tab}`).then(r=>r.json()).then(d=>{setRecords(d);setLoading(false)})
  },[tab])

  const total = records.filter(r=>r.status==='Approved').reduce((s,r)=>s+r.amount,0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Petty Cash</h1>
        <Link href="/petty-cash/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New Request
        </Link>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {['Pending','Approved','Settled','Rejected'].map(t=>(
          <button key={t} onClick={()=>{setTab(t);setLoading(true)}}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab===t?'bg-white shadow text-gray-900':'text-gray-500'}`}>{t}</button>
        ))}
      </div>

      {loading?<div className="text-center py-12 text-gray-400">Loading...</div>:(
        <div className="space-y-3">
          {records.map(r=>(
            <Link key={r.id} href={`/petty-cash/${r.id}`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 cursor-pointer">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">₹{r.amount.toLocaleString('en-IN')} — {r.purpose}</div>
                    <div className="text-sm text-gray-500 mt-1">{r.employee?.first_name} {r.employee?.last_name} · {r.department}</div>
                    <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('en-IN')}</div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${r.status==='Approved'?'bg-green-100 text-green-800':r.status==='Rejected'?'bg-red-100 text-red-800':r.status==='Settled'?'bg-teal-100 text-teal-800':'bg-yellow-100 text-yellow-800'}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {records.length===0&&<div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No {tab.toLowerCase()} requests.</div>}
        </div>
      )}
    </div>
  )
}
