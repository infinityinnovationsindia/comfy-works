export const dynamic = 'force-dynamic'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DashboardClock from '@/components/dashboard-clock'
import {
  Users, Clock, FileText, Flag, CheckSquare,
  DollarSign, Calendar, AlertTriangle, TrendingUp,
  ArrowRight, CheckCircle, XCircle, Timer, UserX,
  UserCheck, AlarmClock
} from 'lucide-react'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  )
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtTime(ts?: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

function StatCard({ label, value, sub, color = 'gray', icon: Icon, href }: {
  label: string; value: string | number; sub?: string;
  color?: 'green' | 'red' | 'orange' | 'blue' | 'gray' | 'yellow';
  icon: any; href?: string;
}) {
  const colors = {
    green: 'bg-green-50 text-green-600', red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600', blue: 'bg-blue-50 text-blue-600',
    gray: 'bg-gray-100 text-gray-600', yellow: 'bg-yellow-50 text-yellow-600',
  }
  const card = (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        {href && <ArrowRight className="h-4 w-4 text-gray-300" />}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{card}</Link> : card
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-700', L1_Approved: 'bg-blue-100 text-blue-700',
    Approved: 'bg-green-100 text-green-700', Rejected: 'bg-red-100 text-red-700',
  }
  const labels: Record<string, string> = {
    Pending: 'Pending', L1_Approved: 'L1 Approved', Approved: 'Approved ✓', Rejected: 'Rejected',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  )
}

// ── Employee status mini-card ────────────────────────────────────────────
function EmpRow({ emp, sub }: { emp: { first_name: string; last_name: string; employee_no: string }; sub?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs flex-shrink-0">
        {emp.first_name[0]}{emp.last_name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{emp.first_name} {emp.last_name}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
export default async function DashboardPage() {
  const supabase = createSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts').select('role, employee_id').eq('id', session.user.id).single()

  const role  = account?.role   ?? 'employee'
  const empId = account?.employee_id

  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const today  = istNow.toISOString().split('T')[0]

  const monthStart = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2,'0')}-01`
  const fy = istNow.getMonth() >= 3
    ? `${istNow.getFullYear()}-${String(istNow.getFullYear() + 1).slice(2)}`
    : `${istNow.getFullYear() - 1}-${String(istNow.getFullYear()).slice(2)}`

  const hour = istNow.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const dateLabel = istNow.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // My data (for all roles)
  const [{ data: myToday }, { data: myBalance }] = await Promise.all([
    empId ? supabase.from('attendance_daily').select('check_in, check_out, status, red_marks_total').eq('employee_id', empId).eq('date', today).single() : Promise.resolve({ data: null }),
    empId ? supabase.from('leave_balances').select('pl_earned, pl_used, pl_balance').eq('employee_id', empId).eq('financial_year', fy).single() : Promise.resolve({ data: null }),
  ])

  // ── SUPER ADMIN / PRODUCTION HEAD / ACCOUNTS ──────────────────────────
  if (['super_admin','production_head','design_head','project_head','accounts','supervisor'].includes(role)) {
    const [
      { data: todayAll },
      { data: pendingLeaves },
      { count: empCount },
      { data: redMarks },
      { data: probAlerts },
    ] = await Promise.all([
      supabase.from('attendance_daily')
        .select(`status, red_marks_total, check_in,
          employee:employees!attendance_daily_employee_id_fkey(
            first_name, last_name, employee_no, department,
            shift:shifts(start_time, end_time)
          )`)
        .eq('date', today),
      supabase.from('leave_requests')
        .select(`id, leave_type, date_from, date_to, created_at,
          employee:employees!leave_requests_employee_id_fkey(first_name, last_name, employee_no, department)`)
        .eq('status', role === 'super_admin' ? 'L1_Approved' : 'Pending')
        .order('created_at', { ascending: false }).limit(6),
      supabase.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase.from('attendance_daily').select('red_marks_total').gte('date', monthStart).lte('date', today),
      role === 'super_admin' ? supabase.from('employees')
        .select('id, first_name, last_name, employee_no, probation_end_date')
        .eq('employment_type', 'Probationer').eq('status', 'Active')
        .gte('probation_end_date', today)
        .lte('probation_end_date', new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0])
        .limit(5) : Promise.resolve({ data: [] }),
    ])

    // ── Shift-aware calculation ──────────────────────────────────────────
    // Get shift start in minutes since midnight for a given employee record
    const shiftStartMins = (emp: any): number => {
      const t = emp?.shift?.start_time ?? '08:00:00'
      const [h, m] = (t as string).split(':').map(Number)
      return h * 60 + m
    }
    // Current IST time in minutes since midnight
    const istMinutes = istNow.getHours() * 60 + istNow.getMinutes()

    const present = todayAll?.filter(a => ['P'].includes(a.status)).length ?? 0
    const onLeave = todayAll?.filter(a => ['PL','HPL','UL','HUL'].includes(a.status)).length ?? 0
    const totalRM = redMarks?.reduce((s, r) => s + (r.red_marks_total ?? 0), 0) ?? 0

    // Only count as absent if the employee's OWN shift has already started
    const absentList = (todayAll ?? []).filter(a => {
      if (!['A','AAA','AAA_PENDING'].includes(a.status)) return false
      return istMinutes >= shiftStartMins((a.employee as any))
    })
    const absent = absentList.length

    // Only count late if their shift has started
    const lateList = (todayAll ?? []).filter(a => {
      if ((a.red_marks_total ?? 0) === 0) return false
      return istMinutes >= shiftStartMins((a.employee as any))
    })
    const lateToday = lateList.length

    const onLeaveList = (todayAll ?? []).filter(a => ['PL','HPL','UL','HUL'].includes(a.status))

    const { data: myEmp } = empId ? await supabase.from('employees').select('first_name').eq('id', empId).single() : { data: null }

    return (
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {greeting}, {myEmp?.first_name ?? 'there'} 👋
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-sm">{dateLabel}</span>
              <span className="text-gray-300">·</span>
              <DashboardClock />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">FY {fy}</p>
            <p className="text-xs font-medium text-[#1D9E75]">{empCount ?? 0} active employees</p>
          </div>
        </div>

        {/* Stat grid — numbers are shift-aware (absent only counted after each employee's shift starts) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Present Today"  value={present}   color="green"  icon={CheckCircle} href="/attendance" />
          <StatCard label="Absent Today"   value={absent}    color="red"    icon={XCircle}     href="/attendance" sub="shift started only" />
          <StatCard label="On Leave Today" value={onLeave}   color="blue"   icon={Calendar}    href="/attendance" />
          <StatCard label="Late Today"     value={lateToday} color="yellow" icon={AlarmClock}  href="/attendance" sub="shift started only" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Pending Approval"   value={pendingLeaves?.length ?? 0}         color="orange" icon={CheckSquare} href="/approvals"  sub="Your sign-off" />
          <StatCard label="Red Marks"          value={totalRM}                            color="yellow" icon={Flag}        href="/red-marks"  sub="This month" />
          <StatCard label="My PL Balance"      value={(myBalance?.pl_balance ?? 0).toFixed(1)} color="green" icon={FileText} sub={`FY ${fy}`} />
          <StatCard label="Probation Alerts"   value={probAlerts?.length ?? 0}            color="orange" icon={AlertTriangle} href="/employees" sub="Due in 60 days" />
        </div>

        {/* Three-column detail panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Absent today */}
          <div className="bg-white border border-red-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-100">
              <UserX className="h-4 w-4 text-red-500" />
              <h3 className="font-semibold text-red-700 text-sm">Absent Today</h3>
              <span className="ml-auto text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                {absentList.length}
              </span>
            </div>
            <div className="px-4 divide-y divide-gray-50 max-h-56 overflow-y-auto">
              {absentList.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No absences today ✓</p>
              ) : absentList.map((a, i) => {
                const emp = a.employee as any
                return emp ? <EmpRow key={i} emp={emp} sub={a.status === 'AAA_PENDING' ? 'Unconfirmed' : a.status} /> : null
              })}
            </div>
          </div>

          {/* On leave today */}
          <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-100">
              <UserCheck className="h-4 w-4 text-blue-500" />
              <h3 className="font-semibold text-blue-700 text-sm">On Leave Today</h3>
              <span className="ml-auto text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                {onLeaveList.length}
              </span>
            </div>
            <div className="px-4 divide-y divide-gray-50 max-h-56 overflow-y-auto">
              {onLeaveList.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nobody on leave today</p>
              ) : onLeaveList.map((a, i) => {
                const emp = a.employee as any
                return emp ? <EmpRow key={i} emp={emp} sub={a.status} /> : null
              })}
            </div>
          </div>

          {/* Late comers today */}
          <div className="bg-white border border-yellow-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 border-b border-yellow-100">
              <AlarmClock className="h-4 w-4 text-yellow-600" />
              <h3 className="font-semibold text-yellow-700 text-sm">Late Today</h3>
              <span className="ml-auto text-xs font-bold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                {lateList.length}
              </span>
            </div>
            <div className="px-4 divide-y divide-gray-50 max-h-56 overflow-y-auto">
              {lateList.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No late comers today ✓</p>
              ) : lateList.map((a, i) => {
                const emp = a.employee as any
                return emp ? <EmpRow key={i} emp={emp} sub={`🚩 ${a.red_marks_total} red mark${(a.red_marks_total ?? 0) > 1 ? 's' : ''}`} /> : null
              })}
            </div>
          </div>
        </div>

        {/* Pending approvals */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-[#1D9E75]" />
              <h2 className="font-bold text-gray-900">Pending Your Approval</h2>
              {(pendingLeaves?.length ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{pendingLeaves?.length}</span>
              )}
            </div>
            <Link href="/approvals" className="text-xs text-[#1D9E75] font-medium hover:underline">View all →</Link>
          </div>
          {(pendingLeaves?.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">All caught up — no pending approvals</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingLeaves?.map(l => {
                const emp = l.employee as any
                return (
                  <div key={l.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-[#1D9E75]/10 flex items-center justify-center text-[#1D9E75] font-bold text-xs flex-shrink-0">
                      {emp?.first_name?.[0]}{emp?.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">
                        {emp?.first_name} {emp?.last_name}
                        <span className="ml-2 text-xs text-gray-400">{emp?.employee_no}</span>
                      </p>
                      <p className="text-xs text-gray-500">{l.leave_type} · {fmtDate(l.date_from)}</p>
                    </div>
                    <Link href="/approvals" className="flex-shrink-0 px-3 py-1.5 bg-[#1D9E75] text-white rounded-lg text-xs font-medium">
                      Review →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Probation alerts */}
        {(probAlerts?.length ?? 0) > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <h2 className="font-bold text-gray-900 text-sm">Probation Confirmations Due (within 60 days)</h2>
            </div>
            <div className="space-y-2">
              {probAlerts?.map(emp => {
                const days = Math.ceil((new Date(emp.probation_end_date!).getTime() - Date.now()) / 86400000)
                return (
                  <div key={emp.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-500">{emp.employee_no} · Due {fmtDate(emp.probation_end_date)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${days <= 14 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {days}d left
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── EMPLOYEE DASHBOARD ─────────────────────────────────────────────────
  const [{ data: myMonthAtt }, { data: myLeaves }] = await Promise.all([
    empId ? supabase.from('attendance_daily').select('status, red_marks_total').eq('employee_id', empId).gte('date', monthStart).lte('date', today) : Promise.resolve({ data: [] }),
    empId ? supabase.from('leave_requests').select('id, leave_type, date_from, date_to, status').eq('employee_id', empId).order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ])
  const daysPresent = myMonthAtt?.filter((a: any) => ['P','PL','HPL'].includes(a.status)).length ?? 0
  const daysAbsent  = myMonthAtt?.filter((a: any) => ['A','AAA'].includes(a.status)).length ?? 0
  const myRedMarks  = myMonthAtt?.reduce((s: number, a: any) => s + (a.red_marks_total ?? 0), 0) ?? 0
  const { data: myEmp } = empId ? await supabase.from('employees').select('first_name, designation, department').eq('id', empId).single() : { data: null }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}, {myEmp?.first_name ?? 'there'} 👋</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-gray-500 text-sm">{dateLabel}</span>
          <span className="text-gray-300">·</span>
          <DashboardClock />
        </div>
        <p className="text-gray-400 text-sm mt-0.5">{myEmp?.designation} · {myEmp?.department}</p>
      </div>

      <div className="bg-gradient-to-r from-[#1D9E75] to-[#178a63] rounded-2xl p-5 text-white">
        <p className="text-xs text-green-200 uppercase tracking-wide font-medium mb-3">Today's Status</p>
        <div className="grid grid-cols-3 gap-4">
          <div><p className="text-xs text-green-200">Status</p><p className="font-bold text-xl">{myToday?.status ?? '—'}</p></div>
          <div><p className="text-xs text-green-200">Check In</p><p className="font-bold text-xl">{fmtTime(myToday?.check_in)}</p></div>
          <div><p className="text-xs text-green-200">Check Out</p><p className="font-bold text-xl">{fmtTime(myToday?.check_out)}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="PL Balance"  value={(myBalance?.pl_balance ?? 0).toFixed(1)} color="green"  icon={FileText}    href="/leave"       sub={`FY ${fy}`} />
        <StatCard label="Present"     value={daysPresent}                             color="blue"   icon={CheckCircle} href="/attendance"  sub="This month" />
        <StatCard label="Absent"      value={daysAbsent}                              color="red"    icon={XCircle}     href="/attendance"  sub="This month" />
        <StatCard label="Red Marks"   value={myRedMarks}                              color="yellow" icon={Flag}        href="/attendance"  sub="This month" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { href: '/leave/apply',     icon: FileText,     label: 'Apply Leave',  sub: `${(myBalance?.pl_balance ?? 0).toFixed(1)} PL left`, color: 'bg-[#1D9E75]/10 text-[#1D9E75]' },
          { href: '/time-off/apply',  icon: Timer,        label: 'Time Off',     sub: 'Personal errand pass',    color: 'bg-blue-50 text-blue-500' },
          { href: '/on-duty/apply',   icon: TrendingUp,   label: 'On Duty',      sub: 'Official movement',       color: 'bg-purple-50 text-purple-500' },
          { href: '/attendance',      icon: Clock,        label: 'Attendance',   sub: 'View history',            color: 'bg-orange-50 text-orange-500' },
        ].map(q => (
          <Link key={q.href} href={q.href} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1D9E75] hover:shadow-sm transition-all">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${q.color}`}>
              <q.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{q.label}</p>
              <p className="text-xs text-gray-400">{q.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {(myLeaves?.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="font-bold text-sm text-gray-900 flex items-center gap-2"><FileText className="h-4 w-4 text-[#1D9E75]" />My Recent Leaves</h2>
            <Link href="/leave" className="text-xs text-[#1D9E75] hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {myLeaves?.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{l.leave_type}</p>
                  <p className="text-xs text-gray-500">{fmtDate(l.date_from)}{l.date_from !== l.date_to ? ` → ${fmtDate(l.date_to)}` : ''}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  l.status === 'Approved' ? 'bg-green-100 text-green-700' :
                  l.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
