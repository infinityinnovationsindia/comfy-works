'use client'

import { useEffect, useState } from 'react'
import { FileText, Download, Search } from 'lucide-react'

type BalanceRow = {
  employee_id:     string
  employee_no:     string
  first_name:      string
  last_name:       string
  department:      string
  employment_type: string
  date_of_joining: string
  pl_earned:       number
  pl_used:         number
  pl_balance:      number
  financial_year:  string
}

export default function LeaveBalancesPage() {
  const now = new Date()
  const currentFY = now.getMonth() >= 3
    ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
    : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`

  const [fy,       setFY]       = useState(currentFY)
  const [data,     setData]     = useState<BalanceRow[]>([])
  const [filtered, setFiltered] = useState<BalanceRow[]>([])
  const [search,   setSearch]   = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [loading,  setLoading]  = useState(true)

  const fyOptions = [currentFY, `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`]

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res  = await fetch(`/api/leave/balances?fy=${fy}`)
        const json = await res.json()
        setData(json.balances || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [fy])

  useEffect(() => {
    let f = data
    if (deptFilter !== 'All') f = f.filter(r => r.department === deptFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      f = f.filter(r =>
        r.first_name.toLowerCase().includes(q) ||
        r.last_name.toLowerCase().includes(q) ||
        r.employee_no.toLowerCase().includes(q)
      )
    }
    setFiltered(f)
  }, [data, search, deptFilter])

  const departments = ['All', ...Array.from(new Set(data.map(r => r.department).filter(Boolean)))]

  function exportCSV() {
    const rows = [
      ['Emp No','Name','Department','Employment Type','Joining Date','PL Earned','PL Used','PL Balance','FY'],
      ...filtered.map(r => [
        r.employee_no,
        `${r.first_name} ${r.last_name}`,
        r.department,
        r.employment_type,
        new Date(r.date_of_joining).toLocaleDateString('en-IN'),
        r.pl_earned,
        r.pl_used,
        r.pl_balance,
        r.financial_year,
      ]),
    ]
    const csv  = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `leave-balances-${fy}.csv`
    a.click()
  }

  function balanceColor(bal: number) {
    if (bal <= 0)  return 'text-red-600'
    if (bal <= 3)  return 'text-orange-500'
    if (bal <= 7)  return 'text-yellow-600'
    return 'text-[#1D9E75]'
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-[#1D9E75]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leave Balances</h1>
            <p className="text-sm text-gray-500">PL earned, used, and remaining per employee</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={fy}
            onChange={e => setFY(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
          >
            {fyOptions.map(f => (
              <option key={f} value={f}>FY {f}</option>
            ))}
          </select>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 bg-[#1D9E75] text-white rounded-lg text-sm font-medium hover:bg-[#178a63]"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
          />
        </div>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
        >
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">Total Employees</p>
          <p className="text-xl font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">Total PL Earned</p>
          <p className="text-xl font-bold text-[#1D9E75]">
            {filtered.reduce((s, r) => s + r.pl_earned, 0).toFixed(1)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">Total PL Used</p>
          <p className="text-xl font-bold text-orange-500">
            {filtered.reduce((s, r) => s + r.pl_used, 0).toFixed(1)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">Zero Balance</p>
          <p className="text-xl font-bold text-red-500">
            {filtered.filter(r => r.pl_balance <= 0).length}
          </p>
        </div>
      </div>

      {/* Table */}
      {loading
        ? <div className="text-center py-12 text-gray-400">Loading leave balances...</div>
        : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">PL Earned</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">PL Used</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400">No records found</td>
                  </tr>
                )}
                {filtered.map(r => {
                  const pct = r.pl_earned > 0 ? Math.min((r.pl_used / r.pl_earned) * 100, 100) : 0
                  return (
                    <tr key={r.employee_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.first_name} {r.last_name}</div>
                        <div className="text-xs text-gray-400">{r.employee_no}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{r.department || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          r.employment_type === 'Permanent'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {r.employment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.pl_earned.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.pl_used.toFixed(1)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${balanceColor(r.pl_balance)}`}>
                        {r.pl_balance.toFixed(1)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-20 mx-auto bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-[#1D9E75] h-1.5 rounded-full transition-all"
                            style={{ width: `${100 - pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }

      <p className="text-xs text-gray-400 mt-4 text-center">
        Balances reset to 0 on April 1 every year · No encashment per company policy
      </p>
    </div>
  )
}
