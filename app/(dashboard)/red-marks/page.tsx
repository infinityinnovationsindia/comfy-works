'use client'

import { useEffect, useState } from 'react'
import { Flag, Download, ChevronLeft, ChevronRight } from 'lucide-react'

type EmployeeRM = {
  employee_id: string
  employee_no: string
  first_name: string
  last_name: string
  department: string
  designation: string
  daily_salary_rate: number
  morning_marks: number
  evening_marks: number
  total_marks: number
  deduction_days: number
  deduction_amount: number
  details: { date: string; morning: number; evening: number; total: number }[]
}

function calcDeduction(marks: number): number {
  // Per spec Section 6
  let days = 0
  if (marks <= 6) {
    days = Math.floor(marks / 3) * 0.5
  } else if (marks <= 12) {
    // First 6 marks: each 3 = 0.5 day
    days += Math.floor(6 / 3) * 0.5
    // Marks 7-12: each 3 = 1 full day
    const extra = marks - 6
    days += Math.floor(extra / 3) * 1.0
  } else {
    // First 6: 1.0 day
    days += 1.0
    // Next 6 (7-12): 2.0 days
    days += 2.0
    // Beyond 12: each mark = 0.5 day
    const beyond = marks - 12
    days += beyond * 0.5
  }
  return days
}

export default function RedMarksPage() {
  const now    = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data,  setData]  = useState<EmployeeRM[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  })

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const n = new Date(); n.setDate(1)
    if (year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth() + 1)) return
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/red-marks?year=${year}&month=${month}`)
        const json = await res.json()
        // Attach deduction calc client-side
        const enriched = (json.employees || []).map((e: EmployeeRM) => ({
          ...e,
          deduction_days: calcDeduction(e.total_marks),
          deduction_amount: calcDeduction(e.total_marks) * (e.daily_salary_rate || 0),
        }))
        setData(enriched)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [year, month])

  function markColor(total: number) {
    if (total === 0)  return 'text-gray-400'
    if (total <= 6)   return 'text-yellow-600'
    if (total <= 12)  return 'text-orange-600'
    return 'text-red-600'
  }
  function markBg(total: number) {
    if (total === 0)  return 'bg-gray-50'
    if (total <= 6)   return 'bg-yellow-50'
    if (total <= 12)  return 'bg-orange-50'
    return 'bg-red-50'
  }

  const totalDeduction = data.reduce((s, e) => s + e.deduction_amount, 0)
  const atRisk = data.filter(e => e.total_marks > 0).length

  async function exportCSV() {
    const rows = [
      ['Emp No','Name','Department','Morning Marks','Evening Marks','Total Marks','Deduction Days','Deduction (₹)'],
      ...data.map(e => [
        e.employee_no,
        `${e.first_name} ${e.last_name}`,
        e.department,
        e.morning_marks,
        e.evening_marks,
        e.total_marks,
        e.deduction_days,
        e.deduction_amount.toFixed(0),
      ]),
    ]
    const csv  = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `red-marks-${year}-${String(month).padStart(2,'0')}.csv`
    a.click()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Flag className="h-6 w-6 text-red-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Red Marks Report</h1>
            <p className="text-sm text-gray-500">Late coming & early going penalties</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-4 py-2 font-medium text-gray-700 min-w-[160px] text-center">
            {monthLabel}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 bg-[#1D9E75] text-white rounded-lg text-sm font-medium hover:bg-[#178a63]"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Employees Affected</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{atRisk}</p>
          <p className="text-xs text-gray-400">of {data.length} total</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Red Marks</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {data.reduce((s, e) => s + e.total_marks, 0)}
          </p>
          <p className="text-xs text-gray-400">this month</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Deduction</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">
            ₹{totalDeduction.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-400">payroll deduction</p>
        </div>
      </div>

      {/* Deduction tiers legend */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-xs text-blue-700">
        <p className="font-semibold mb-1">Red Mark Deduction Rules (per spec):</p>
        <div className="grid grid-cols-3 gap-2">
          <span>1–6 marks: every 3 = ½ day deduction</span>
          <span>7–12 marks: every 3 = 1 full day deduction</span>
          <span>Beyond 12: every 1 mark = ½ day deduction</span>
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading red marks data...</div>}

      {!loading && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Morning</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Evening</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Total</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Ded. Days</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-400">
                    No red marks data for this month
                  </td>
                </tr>
              )}
              {data.map(e => (
                <>
                  <tr
                    key={e.employee_id}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${markBg(e.total_marks)}`}
                    onClick={() => setExpanded(expanded === e.employee_id ? null : e.employee_id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{e.first_name} {e.last_name}</div>
                      <div className="text-xs text-gray-400">{e.employee_no} · {e.department}</div>
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold ${markColor(e.morning_marks)}`}>
                      {e.morning_marks > 0 ? e.morning_marks : '—'}
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold ${markColor(e.evening_marks)}`}>
                      {e.evening_marks > 0 ? e.evening_marks : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 font-bold ${markColor(e.total_marks)}`}>
                        {e.total_marks > 0 && <Flag className="h-3 w-3" />}
                        {e.total_marks}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {e.deduction_days > 0 ? `${e.deduction_days}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">
                      {e.deduction_amount > 0
                        ? `₹${e.deduction_amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                        : '—'
                      }
                    </td>
                  </tr>
                  {expanded === e.employee_id && e.details && e.details.length > 0 && (
                    <tr key={e.employee_id + '_detail'} className="bg-gray-50">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="text-xs font-semibold text-gray-500 mb-2">Day-by-day breakdown:</div>
                        <div className="flex flex-wrap gap-2">
                          {e.details.map(d => (
                            <div key={d.date} className="bg-white border border-red-200 rounded-lg px-2 py-1 text-xs">
                              <span className="text-gray-600">
                                {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </span>
                              <span className="ml-1.5 text-red-600 font-bold">🚩{d.total}</span>
                              {d.morning > 0 && <span className="ml-1 text-gray-400">(M:{d.morning}</span>}
                              {d.evening > 0 && <span className="text-gray-400"> E:{d.evening})</span>}
                              {d.morning > 0 && d.evening === 0 && <span className="text-gray-400">)</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
