'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Timer, Plus, RefreshCw, AlertTriangle } from 'lucide-react'

type TOReq = {
  id: string; date: string; time_out: string
  time_in_expected?: string; time_in_actual?: string
  purpose: string; status: string; created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Returned: 'bg-blue-100 text-blue-700',
}

export default function TimeOffPage() {
  const [requests, setRequests] = useState<TOReq[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/time-off')
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setRequests((await res.json()).requests || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const fmtT = (t?: string) => {
    if (!t) return '—'
    const [h, m] = t.split(':'); const hr = parseInt(h)
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Timer className="h-6 w-6 text-[#1D9E75]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Time Off</h1>
            <p className="text-sm text-gray-500">Personal errand passes</p>
          </div>
        </div>
        <Link href="/time-off/apply" className="flex items-center gap-2 px-4 py-2 bg-[#1D9E75] text-white rounded-xl text-sm font-medium hover:bg-[#178a63]">
          <Plus className="h-4 w-4" /> Apply
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={load} className="text-sm text-red-600 flex items-center gap-1 hover:underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading...
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="text-center py-12">
          <Timer className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No time-off requests yet</p>
          <Link href="/time-off/apply" className="mt-2 inline-block text-[#1D9E75] text-sm hover:underline">Apply now →</Link>
        </div>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    <span className="text-sm font-medium text-gray-900">{fmt(r.date)}</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Out: {fmtT(r.time_out)}
                    {r.time_in_expected ? ` · Expected back: ${fmtT(r.time_in_expected)}` : ''}
                  </p>
                  {r.time_in_actual && (
                    <p className="text-xs text-green-600 mt-0.5">Returned: {fmtT(r.time_in_actual)}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1 truncate">{r.purpose}</p>
                </div>
                <p className="text-xs text-gray-400 flex-shrink-0">{fmt(r.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
