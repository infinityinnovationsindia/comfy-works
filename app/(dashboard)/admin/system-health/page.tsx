'use client'
import { useEffect, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Power } from 'lucide-react'

type Health = {
  overall_status: 'healthy' | 'degraded' | 'down'
  checked_at: string
  bridge: any
  admin: any
}

type RestartEntry = {
  id: string
  action: string
  changed_at: string
  reason: string | null
  new_values: any
  old_values: any
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [history, setHistory] = useState<RestartEntry[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState(false)
  const [restartMessage, setRestartMessage] = useState<string | null>(null)
  const [restartError, setRestartError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [reason, setReason] = useState('')

  async function fetchHealth() {
    try {
      const r = await fetch('/api/system-health/status', { cache: 'no-store' })
      if (r.status === 403 || r.status === 401) { setForbidden(true); return }
      if (r.ok) { setHealth(await r.json()); setLoading(false) }
    } catch {}
  }

  async function fetchHistory() {
    try {
      const r = await fetch('/api/system-health/restart-history', { cache: 'no-store' })
      if (r.ok) {
        const data = await r.json()
        setHistory(data.restarts || [])
      }
    } catch {}
  }

  useEffect(() => {
    fetchHealth()
    fetchHistory()
    const id = setInterval(fetchHealth, 5000)
    return () => clearInterval(id)
  }, [])

  async function handleRestart() {
    setRestarting(true)
    setRestartMessage(null)
    setRestartError(null)
    try {
      const r = await fetch('/api/system-health/restart-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Manual restart from dashboard' }),
      })
      const data = await r.json()
      if (r.ok) {
        setRestartMessage('Restart triggered. Bridge will be back in ~3 seconds.')
        setShowConfirm(false)
        setReason('')
        setTimeout(() => { fetchHealth(); fetchHistory() }, 4000)
      } else {
        setRestartError(data.error || 'Restart failed')
      }
    } catch (e: any) {
      setRestartError(e.message || 'Network error')
    } finally {
      setRestarting(false)
    }
  }

  if (forbidden) {
    return (
      <div className="p-8 text-center text-gray-600">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-500" />
        <div className="text-lg font-semibold">Access denied</div>
        <div className="text-sm mt-1">This page is restricted to Super Admin.</div>
      </div>
    )
  }

  const status = health?.overall_status
  const bridge = health?.bridge
  const admin = health?.admin

  const StatusIcon =
    status === 'healthy' ? CheckCircle2 :
    status === 'degraded' ? AlertTriangle :
    status === 'down' ? AlertCircle :
    Activity

  const statusColor =
    status === 'healthy' ? 'text-green-700 bg-green-50 border-green-200' :
    status === 'degraded' ? 'text-yellow-700 bg-yellow-50 border-yellow-200' :
    status === 'down' ? 'text-red-700 bg-red-50 border-red-200' :
    'text-gray-700 bg-gray-50 border-gray-200'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6" /> System Health
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Live status of biometric bridge and admin service
          </p>
        </div>
        <button
          onClick={() => { fetchHealth(); fetchHistory() }}
          className="p-2 rounded-lg border hover:bg-gray-50"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Overall status */}
      <div className={`rounded-2xl border p-5 mb-4 ${statusColor}`}>
        <div className="flex items-center gap-3">
          <StatusIcon className="w-7 h-7" />
          <div>
            <div className="text-lg font-semibold">
              {loading ? 'Checking...' :
                status === 'healthy' ? 'All systems operational' :
                status === 'degraded' ? 'Partial outage detected' :
                status === 'down' ? 'System down' : 'Unknown'}
            </div>
            {health?.checked_at && (
              <div className="text-xs opacity-75">
                Last checked {new Date(health.checked_at).toLocaleTimeString('en-IN')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ServiceCard title="Biometric Bridge" data={bridge} />
        <ServiceCard title="Admin Service" data={admin} />
      </div>

      {/* Restart button */}
      <div className="rounded-2xl border bg-white p-5 mb-4">
        <h2 className="font-semibold flex items-center gap-2 mb-1">
          <Power className="w-4 h-4" /> Restart Bridge
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Use this if the bridge is hung or punches stop saving. Restart takes ~3 seconds.
          No data is lost — the device buffers punches during restart.
        </p>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
            disabled={restarting}
          >
            Restart Bridge
          </button>
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-900">
              Confirm restart? This will briefly interrupt punch collection.
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              maxLength={500}
            />
            <div className="flex gap-2">
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {restarting ? 'Restarting...' : 'Confirm Restart'}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setReason('') }}
                disabled={restarting}
                className="px-4 py-2 rounded-lg border font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {restartMessage && (
          <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
            {restartMessage}
          </div>
        )}
        {restartError && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {restartError}
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold mb-3">Restart History</h2>
        {history.length === 0 ? (
          <div className="text-sm text-gray-500">No restarts yet.</div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div key={entry.id} className="text-sm border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${entry.action === 'BRIDGE_RESTART' ? 'text-green-700' : 'text-red-700'}`}>
                    {entry.action === 'BRIDGE_RESTART' ? '✓ Success' : '✗ Failed'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(entry.changed_at).toLocaleString('en-IN')}
                  </span>
                </div>
                {entry.reason && (
                  <div className="text-xs text-gray-600 mt-1">{entry.reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ServiceCard({ title, data }: { title: string; data: any }) {
  const ok = data?.status === 'ok'
  return (
    <div className={`rounded-2xl border p-4 ${ok ? 'bg-white' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
        <div className={`text-xs px-2 py-1 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {ok ? 'Online' : 'Offline'}
        </div>
      </div>
      {ok ? (
        <div className="space-y-1 text-xs text-gray-600">
          {data.bridge_version && <div>Version: <span className="font-medium text-gray-900">{data.bridge_version}</span></div>}
          {data.version && !data.bridge_version && <div>Version: <span className="font-medium text-gray-900">{data.version}</span></div>}
          {data.uptime_seconds != null && <div>Uptime: <span className="font-medium text-gray-900">{formatUptime(data.uptime_seconds)}</span></div>}
          {data.pid != null && <div>PID: <span className="font-medium text-gray-900">{data.pid}</span></div>}
          {data.device_serial && <div>Device: <span className="font-medium text-gray-900">{data.device_serial}</span></div>}
          {data.last_device_poll_age_seconds != null && (
            <div>Last device poll: <span className="font-medium text-gray-900">{formatAge(data.last_device_poll_age_seconds)}</span></div>
          )}
          {data.last_punch_age_seconds != null && (
            <div>Last punch: <span className="font-medium text-gray-900">{formatAge(data.last_punch_age_seconds)}</span></div>
          )}
          {data.punches_today != null && <div>Punches today: <span className="font-medium text-gray-900">{data.punches_today}</span></div>}
          {data.employee_cache_size != null && <div>Employee cache: <span className="font-medium text-gray-900">{data.employee_cache_size}</span></div>}
          {data.restarts_last_hour != null && <div>Restarts (1h): <span className="font-medium text-gray-900">{data.restarts_last_hour}</span></div>}
        </div>
      ) : (
        <div className="text-xs text-red-700">{data?.error || 'Service unreachable'}</div>
      )}
    </div>
  )
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}