'use client'

import { useState } from 'react'
import { Settings, Play, CheckCircle, AlertCircle, Wifi, Clock, Calendar, RefreshCw, Bell } from 'lucide-react'

type CronJob = {
  key:         string
  label:       string
  description: string
  icon:        React.ElementType
  endpoint:    string
  danger?:     boolean
}

const CRON_JOBS: CronJob[] = [
  {
    key:         'process-attendance',
    label:       'Process Today\'s Attendance',
    description: 'Runs the attendance processor for today — calculates status codes, red marks, and AAA flags from biometric data.',
    icon:        Clock,
    endpoint:    '/api/cron/process-attendance',
  },
  {
    key:         'monthly-accrual',
    label:       'Run Monthly PL Accrual',
    description: 'Calculates and credits PL earned last month to all eligible employees based on attendance.',
    icon:        Calendar,
    endpoint:    '/api/cron/monthly-accrual',
  },
  {
    key:         'year-end',
    label:       'Year-End PL Lapse (April 1)',
    description: 'Zeros all PL balances at the start of the new financial year. Only run on April 1. This is IRREVERSIBLE.',
    icon:        RefreshCw,
    endpoint:    '/api/cron/year-end',
    danger:      true,
  },
]

type RunState = 'idle' | 'running' | 'success' | 'error'

export default function SettingsPage() {
  const [states,  setStates]  = useState<Record<string, RunState>>({})
  const [results, setResults] = useState<Record<string, string>>({})
  const [waTest,  setWaTest]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [waPhone, setWaPhone] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)

  async function runCron(job: CronJob) {
    if (job.danger && confirm !== job.key) {
      setConfirm(job.key)
      return
    }
    setConfirm(null)
    setStates(s => ({ ...s, [job.key]: 'running' }))
    setResults(r => ({ ...r, [job.key]: '' }))
    try {
      const res  = await fetch(job.endpoint, { method: 'POST' })
      const json = await res.json()
      setStates(s => ({ ...s, [job.key]: res.ok ? 'success' : 'error' }))
      setResults(r => ({ ...r, [job.key]: json.message || JSON.stringify(json) }))
    } catch (e: any) {
      setStates(s => ({ ...s, [job.key]: 'error' }))
      setResults(r => ({ ...r, [job.key]: e.message }))
    }
    setTimeout(() => setStates(s => ({ ...s, [job.key]: 'idle' })), 8000)
  }

  async function testWhatsApp() {
    if (!waPhone.trim()) return
    setWaTest('sending')
    try {
      const res = await fetch('/api/settings/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-whatsapp', phone: waPhone }),
      })
      setWaTest(res.ok ? 'sent' : 'error')
    } catch {
      setWaTest('error')
    }
    setTimeout(() => setWaTest('idle'), 5000)
  }

  function StateIcon({ state }: { state: RunState }) {
    if (state === 'running') return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
    if (state === 'success') return <CheckCircle className="h-4 w-4 text-[#1D9E75]" />
    if (state === 'error')   return <AlertCircle className="h-4 w-4 text-red-500" />
    return null
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6 text-[#1D9E75]" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">System administration · Super Admin only</p>
        </div>
      </div>

      {/* Cron Jobs */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-900">Scheduled Jobs</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            These run automatically every night. Use these buttons only if you need to run them manually.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {CRON_JOBS.map(job => {
            const state  = states[job.key]  || 'idle'
            const result = results[job.key] || ''
            const needsConfirm = confirm === job.key

            return (
              <div key={job.key} className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    job.danger ? 'bg-red-50' : 'bg-[#1D9E75]/10'
                  }`}>
                    <job.icon className={`h-5 w-5 ${job.danger ? 'text-red-500' : 'text-[#1D9E75]'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{job.label}</p>
                      {job.danger && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                          DANGER
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{job.description}</p>
                    {result && (
                      <p className={`text-xs mt-2 p-2 rounded-lg ${
                        state === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {result}
                      </p>
                    )}
                    {needsConfirm && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700 font-medium mb-2">
                          ⚠️ Are you sure? This will zero ALL employee PL balances. This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => runCron(job)}
                            className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700"
                          >
                            Yes, run year-end lapse
                          </button>
                          <button
                            onClick={() => setConfirm(null)}
                            className="flex-1 py-1.5 border border-red-300 text-red-700 rounded-lg text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => runCron(job)}
                    disabled={state === 'running'}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                      job.danger
                        ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                        : 'bg-[#1D9E75] text-white hover:bg-[#178a63]'
                    } disabled:opacity-50`}
                  >
                    <StateIcon state={state} />
                    {state === 'running' ? 'Running...' : state === 'success' ? 'Done ✓' : (
                      <><Play className="h-3 w-3" /> Run</>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* WhatsApp Test */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Bell className="h-4 w-4 text-green-600" />
            WhatsApp Notification Test
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Send a test message to verify WhatsApp Business API is working.
          </p>
        </div>
        <div className="p-5 flex gap-3">
          <input
            type="tel"
            placeholder="91XXXXXXXXXX (with country code)"
            value={waPhone}
            onChange={e => setWaPhone(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
          />
          <button
            onClick={testWhatsApp}
            disabled={waTest === 'sending' || !waPhone.trim()}
            className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
          >
            {waTest === 'sending' && <RefreshCw className="h-4 w-4 animate-spin" />}
            {waTest === 'sent'    && <CheckCircle className="h-4 w-4" />}
            {waTest === 'error'   && <AlertCircle className="h-4 w-4" />}
            {waTest === 'idle'    ? 'Send Test' :
             waTest === 'sending' ? 'Sending...' :
             waTest === 'sent'    ? 'Sent!' : 'Failed'}
          </button>
        </div>
      </div>

      {/* Biometric Status */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-500" />
            Biometric Machine
          </h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Device</p>
              <p className="font-medium text-gray-900 mt-0.5">ZKTeco X2008</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">IP Address</p>
              <p className="font-medium text-gray-900 mt-0.5 font-mono">192.168.29.110</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Location</p>
              <p className="font-medium text-gray-900 mt-0.5">Factory (primary)</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Method</p>
              <p className="font-medium text-gray-900 mt-0.5">ADMS push (ZKTeco)</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Showroom biometric to be installed in Phase 4. Sync service runs on factory local machine via PM2.
          </p>
        </div>
      </div>
    </div>
  )
}
