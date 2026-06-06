'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

type Health = {
  overall_status: 'healthy' | 'degraded' | 'down'
  checked_at: string
  bridge: any
  admin: any
}

export default function SystemHealthWidget() {
  const [health, setHealth] = useState<Health | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchHealth() {
      try {
        const r = await fetch('/api/system-health/status', { cache: 'no-store' })
        if (r.status === 403 || r.status === 401) {
          if (!cancelled) setHidden(true)
          return
        }
        if (r.ok) {
          const data = await r.json()
          if (!cancelled) {
            setHealth(data)
            setLoading(false)
          }
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    fetchHealth()
    const id = setInterval(fetchHealth, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (hidden) return null

  const status = health?.overall_status
  const bridgeUp = health?.bridge?.status === 'ok'
  const adminUp = health?.admin?.status === 'ok'
  const lastPunchAge = health?.bridge?.last_punch_age_seconds
  const punchesToday = health?.bridge?.punches_today
  const deviceAge = health?.bridge?.last_device_poll_age_seconds

  const statusColor =
    status === 'healthy' ? 'bg-green-50 border-green-200 text-green-900' :
    status === 'degraded' ? 'bg-yellow-50 border-yellow-200 text-yellow-900' :
    status === 'down' ? 'bg-red-50 border-red-200 text-red-900' :
    'bg-gray-50 border-gray-200 text-gray-700'

  const StatusIcon =
    status === 'healthy' ? CheckCircle2 :
    status === 'degraded' ? AlertTriangle :
    status === 'down' ? AlertCircle :
    Activity

  return (
    <Link
      href="/admin/system-health"
      className={`block rounded-2xl border p-5 transition hover:shadow-sm ${statusColor}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusIcon className="w-5 h-5" />
          <div>
            <div className="text-sm font-semibold">System Health</div>
            <div className="text-xs opacity-75">
              {loading ? 'Checking...' :
                status === 'healthy' ? 'All systems operational' :
                status === 'degraded' ? 'Partial outage' :
                status === 'down' ? 'System down' : 'Unknown'}
            </div>
          </div>
        </div>
        <div className="text-xs opacity-75">→</div>
      </div>

      {!loading && health && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="opacity-60">Bridge</div>
            <div className="font-medium">{bridgeUp ? 'Online' : 'Offline'}</div>
          </div>
          <div>
            <div className="opacity-60">Admin</div>
            <div className="font-medium">{adminUp ? 'Online' : 'Offline'}</div>
          </div>
          {bridgeUp && (
            <>
              <div>
                <div className="opacity-60">Device</div>
                <div className="font-medium">
                  {deviceAge == null ? '—' :
                   deviceAge < 60 ? '🟢 Connected' :
                   deviceAge < 300 ? `🟡 Stale (${formatAge(deviceAge)})` :
                   `🔴 Offline (${formatAge(deviceAge)})`}
                </div>
              </div>
              <div>
                <div className="opacity-60">Punches today</div>
                <div className="font-medium">{punchesToday ?? '—'}</div>
              </div>
            </>
          )}
        </div>
      )}
    </Link>
  )
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}