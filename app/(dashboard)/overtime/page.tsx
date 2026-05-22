
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const STATUS_COLORS: Record<string,string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Shailoo_Approved: 'bg-blue-100 text-blue-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
}

export default function OvertimePage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/overtime').then(r => r.json()).then(d => { setRecords(d); setLoading(false) })
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Overtime Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Form #28 — Dual approval: Shailoo → Kush</p>
        </div>
        <Link href="/overtime/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New OT Request
        </Link>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {records.map(ot => (
            <Link key={ot.id} href={`/overtime/${ot.id}`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{ot.project_site}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {new Date(ot.date_of_ot).toLocaleDateString('en-IN')} · {ot.time_from}–{ot.time_to} · {ot.planned_hours?.toFixed(1)} hrs planned
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {ot.overtime_employees?.length || 0} employees · Raised by {ot.raised_by_emp?.first_name} {ot.raised_by_emp?.last_name}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[ot.status] || 'bg-gray-100 text-gray-600'}`}>
                    {ot.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {records.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No overtime requests yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
