
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function WorkPermissionPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/work-permission').then(r=>r.json()).then(d=>{setRecords(d);setLoading(false)})
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Work Permission</h1>
          <p className="text-sm text-gray-500 mt-1">Form #26 — After-hours factory access</p>
        </div>
        <Link href="/work-permission/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New Request
        </Link>
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {records.map(wp=>(
            <Link key={wp.id} href={`/work-permission/${wp.id}`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 cursor-pointer">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{wp.project_site || 'General Work'}</div>
                    <div className="text-sm text-gray-500 mt-1">{new Date(wp.date_of_work).toLocaleDateString('en-IN')} · {wp.time_from}–{wp.time_to}</div>
                    <div className="text-sm text-gray-500">{wp.work_permission_employees?.length||0} employees · SIP/PIP: {wp.sip_pip}</div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${wp.status==='Approved'?'bg-green-100 text-green-800':wp.status==='Rejected'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>
                    {wp.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {records.length===0 && <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No work permissions yet.</div>}
        </div>
      )}
    </div>
  )
}
