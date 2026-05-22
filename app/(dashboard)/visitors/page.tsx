
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const today = new Date().toISOString().split('T')[0]

  function load() {
    const params = new URLSearchParams({ date: today })
    if (search) params.set('search', search)
    fetch(`/api/visitors?${params}`).then(r=>r.json()).then(d=>{setVisitors(d);setLoading(false)})
  }

  useEffect(()=>{ load() },[search])

  async function checkout(id:string) {
    await fetch(`/api/visitors/${id}/checkout`,{method:'POST'})
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Visitor Management</h1>
          <p className="text-sm text-gray-500 mt-1">Today's visitors — {new Date().toLocaleDateString('en-IN')}</p>
        </div>
        <Link href="/visitors/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + Register Visitor
        </Link>
      </div>

      <input type="text" placeholder="Search by name or company..." value={search}
        onChange={e=>setSearch(e.target.value)}
        className="border rounded-lg px-4 py-2.5 text-sm w-full max-w-sm mb-4"/>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {visitors.map(v=>(
            <div key={v.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{v.name}</div>
                  <div className="text-sm text-gray-500">{v.company||'—'} · To meet: {v.host?.first_name} {v.host?.last_name}</div>
                  <div className="text-sm text-gray-500 mt-1">Purpose: {v.purpose}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    In: {new Date(v.time_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}
                    {v.time_out && ` · Out: ${new Date(v.time_out).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!v.time_out ? (
                    <button onClick={()=>checkout(v.id)}
                      className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-medium">
                      Log Exit
                    </button>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">Exited</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {visitors.length===0 && <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No visitors today.</div>}
        </div>
      )}
    </div>
  )
}
