import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Users, Clock, FileText, Flag, CheckSquare,
  DollarSign, Calendar, AlertTriangle, TrendingUp,
  ArrowRight, CheckCircle, XCircle, Timer
} from 'lucide-react'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color = 'gray', icon: Icon, href,
}: {
  label: string; value: string | number; sub?: string;
  color?: 'green' | 'red' | 'orange' | 'blue' | 'gray' | 'yellow';
  icon: any; href?: string;
}) {
  const colors = {
    green:  'bg-green-50 text-green-600',
    red:    'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    blue:   'bg-blue-50 text-blue-600',
    gray:   'bg-gray-100 text-gray-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  }
  const card = (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        {href && <ArrowRight className="h-4 w-4 text-gray-300" />}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-3">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{card}</Link> : card
}

// ── STATUS badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    Pending:     'bg-yellow-100 text-yellow-700',
    L1_Approved: 'bg-blue-100 text-blue-700',
    Approved:    'bg-green-100 text-green-700',
    Rejected:    'bg-red-100 text-red-700',
    P:           'bg-green-100 text-green-700',
    A:           'bg-red-100 text-red-700',
    AAA_PENDING: 'bg-red-100 text-red-700',
  }
  const l: Record<string, string> = {
    Pending: 'Pending', L1_Approved: 'L1 Approved',
    Approved: 'Approved', Rejected: 'Rejected',
    P: 'Present', A: 'Absent', AAA_PENDING: 'Absent',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s[status] || 'bg-gray-100 text-gray-600'}`}>
      {l[status] || status}
    </span>
  )
}

// ══════════════════════════════════════════════════════════════════════════
export default async function DashboardPage() {
  const supabase = createSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, employee_id')
    .eq('id', session.user.id)
    .single()

  const role   = account?.role   ?? 'employee'
  const empId  = account?.employee_id

  // Today's date in IST
  const today = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  ).toISOString().split('T')[0]

  // Current month range
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-01`

  // Current FY
  const fy = d.getMonth() >= 3
    ? `${d.getFullYear()}-${String(d.getFullYear() + 1).slice(2)}`
    : `${d.getFullYear() - 1}-${String(d.getFullYear()).slice(2)}`

  // ── Shared data: my attendance today ─────────────────────────────────
  const { data: myToday } = empId ? await supabase
    .from('attendance_daily')
    .select('check_in, check_out, status, red_marks_total')
    .eq('employee_id', empId)
    .eq('date', today)
    .single() : { data: null }

  // ── Shared: my leave balance ──────────────────────────────────────────
  const { data: myBalance } = empId ? await supabase
    .from('leave_balances')
    .select('pl_earned, pl_used, pl_balance')
    .eq('employee_id', empId)
    .eq('financial_year', fy)
    .single() : { data: null }

  // ══════════════════════════════════════════════════════════════════════
  // SUPER ADMIN DASHBOARD
  // ══════════════════════════════════════════════════════════════════════
  if (role === 'super_admin') {
    const [
      { data: todayAtt },
      { data: pendingLeaves },
      { count: employeeCount },
      { data: redMarks },
      { data: probationAlerts },
    ] = await Promise.all([
      supabase.from('attendance_daily')
        .select('status')
        .eq('date', today),

      supabase.from('leave_requests')
        .select(`id, leave_type, date_from, date_to, reason, created_at,
          employee:employees!leave_requests_employee_id_fkey(first_name, last_name, employee_no, department)`)
        .eq('status', 'L1_Approved')
        .order('created_at', { ascending: false })
        .limit(8),

      supabase.from('employees')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Active'),

      supabase.from('attendance_daily')
        .select('red_marks_total')
        .gte('date', monthStart)
        .lte('date', today),

      supabase.from('employees')
        .select('id, first_name, last_name, employee_no, probation_end_date, date_of_joining')
        .eq('employment_type', 'Probationer')
        .eq('status', 'Active')
        .gte('probation_end_date', today)
        .lte('probation_end_date', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .limit(5),
    ])

    const present      = todayAtt?.filter(a => ['P','PL','HPL','UL','HUL'].includes(a.status)).length ?? 0
    const absent       = todayAtt?.filter(a => ['A','AAA','AAA_PENDING'].includes(a.status)).length ?? 0
    const onLeave      = todayAtt?.filter(a => ['PL','HPL','UL','HUL'].includes(a.status)).length ?? 0
    const totalRedMarks = redMarks?.reduce((s, r) => s + (r.red_marks_total ?? 0), 0) ?? 0

    // Get my own employee info
    const { data: myEmp } = empId ? await supabase
      .from('employees')
      .select('first_name')
      .eq('id', empId)
      .single() : { data: null }

    const hour = d.getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {myEmp?.first_name ?? 'Kush'} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Present Today"    value={present}        color="green"  icon={CheckCircle} href="/attendance" />
          <StatCard label="Absent Today"     value={absent}         color="red"    icon={XCircle}     href="/attendance" />
          <StatCard label="Awaiting Approval" value={pendingLeaves?.length ?? 0} color="orange" icon={CheckSquare} href="/approvals" sub="Your final sign-off" />
          <StatCard label="Red Marks"        value={totalRedMarks}  color="yellow" icon={Flag}        href="/red-marks" sub="This month" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Employees" value={employeeCount ?? 0} color="blue" icon={Users}     href="/employees" />
          <StatCard label="On Leave Today"   value={onLeave}            color="gray" icon={Calendar}  href="/attendance" />
          <StatCard label="PL Balance"       value={(myBalance?.pl_balance ?? 0).toFixed(1)} color="green" icon={FileText} sub={`FY ${fy}`} />
          <StatCard label="Probation Alerts" value={probationAlerts?.length ?? 0} color="orange" icon={AlertTriangle} href="/employees" sub="Confirm within 60 days" />
        </div>

        {/* Pending approvals */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-[#1D9E75]" />
              <h2 className="font-bold text-gray-900">Pending Your Approval</h2>
              {(pendingLeaves?.length ?? 0) > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-semibold">
                  {pendingLeaves?.length}
                </span>
              )}
            </div>
            <Link href="/approvals" className="text-sm text-[#1D9E75] hover:underline font-medium">
              View all →
            </Link>
          </div>

          {pendingLeaves?.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">All caught up — no pending approvals</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingLeaves?.map(leave => {
                const emp = leave.employee as any
                return (
                  <div key={leave.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-9 h-9 rounded-full bg-[#1D9E75]/10 flex items-center justify-center text-[#1D9E75] font-bold text-sm flex-shrink-0">
                      {emp?.first_name?.[0]}{emp?.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">
                        {emp?.first_name} {emp?.last_name}
                        <span className="ml-2 text-xs text-gray-400">{emp?.employee_no}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {leave.leave_type} · {fmtDate(leave.date_from)}
                        {leave.date_from !== leave.date_to && ` → ${fmtDate(leave.date_to)}`}
                      </p>
                    </div>
                    <Link
                      href="/approvals"
                      className="flex-shrink-0 px-3 py-1.5 bg-[#1D9E75] text-white rounded-lg text-xs font-medium hover:bg-[#178a63]"
                    >
                      Review
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Probation alerts */}
        {(probationAlerts?.length ?? 0) > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <h2 className="font-bold text-gray-900">Probation Confirmations Due</h2>
            </div>
            <div className="space-y-2">
              {probationAlerts?.map(emp => {
                const daysLeft = Math.ceil(
                  (new Date(emp.probation_end_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                )
                return (
                  <div key={emp.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-500">{emp.employee_no} · Due: {fmtDate(emp.probation_end_date)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${daysLeft <= 14 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {daysLeft} days
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

  // ══════════════════════════════════════════════════════════════════════
  // MANAGER DASHBOARD (production_head, design_head, project_head, accounts, supervisor)
  // ══════════════════════════════════════════════════════════════════════
  if (['production_head','design_head','project_head','accounts','supervisor'].includes(role)) {
    const [
      { data: pendingApprovals },
      { data: myTeamToday },
      { data: myLeaves },
    ] = await Promise.all([
      supabase.from('leave_requests')
        .select(`id, leave_type, date_from, date_to, reason, created_at,
          employee:employees!leave_requests_employee_id_fkey(first_name, last_name, employee_no)`)
        .eq('status', 'Pending')
        .eq('l1_approver_id', empId)
        .order('created_at', { ascending: false })
        .limit(8),

      supabase.from('attendance_daily')
        .select(`status, employee:employees!attendance_daily_employee_id_fkey(first_name, last_name, employee_no)`)
        .eq('date', today)
        .in('status', ['A', 'AAA_PENDING', 'AAA']),

      empId ? supabase.from('leave_requests')
        .select('id, leave_type, date_from, date_to, status')
        .eq('employee_id', empId)
        .in('status', ['Pending', 'L1_Approved', 'Approved'])
        .order('created_at', { ascending: false })
        .limit(5) : Promise.resolve({ data: [] }),
    ])

    const { data: myEmp } = empId ? await supabase
      .from('employees')
      .select('first_name')
      .eq('id', empId)
      .single() : { data: null }

    const hour = d.getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {myEmp?.first_name ?? 'there'} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Pending Approvals" value={pendingApprovals?.length ?? 0} color="orange" icon={CheckSquare} href="/approvals" sub="Need your action" />
          <StatCard label="Team Absences"     value={myTeamToday?.length ?? 0}      color="red"    icon={Users}       href="/attendance" sub="Today" />
          <StatCard label="My PL Balance"     value={(myBalance?.pl_balance ?? 0).toFixed(1)} color="green" icon={FileText} sub={`FY ${fy}`} />
          <StatCard label="My Check-In"       value={myToday?.check_in ? new Date('1970-01-01T' + myToday.check_in.split('T')[1]).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'} color="blue" icon={Clock} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Pending approvals */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-[#1D9E75]" />
                Pending Approvals
              </h2>
              <Link href="/approvals" className="text-xs text-[#1D9E75] hover:underline">View all →</Link>
            </div>
            {(pendingApprovals?.length ?? 0) === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No pending approvals</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingApprovals?.slice(0, 5).map(l => {
                  const emp = l.employee as any
                  return (
                    <div key={l.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-8 h-8 rounded-full bg-[#1D9E75]/10 flex items-center justify-center text-[#1D9E75] font-bold text-xs flex-shrink-0">
                        {emp?.first_name?.[0]}{emp?.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{emp?.first_name} {emp?.last_name}</p>
                        <p className="text-xs text-gray-500">{l.leave_type} · {fmtDate(l.date_from)}</p>
                      </div>
                      <Link href="/approvals" className="text-xs text-[#1D9E75] font-medium hover:underline">Act →</Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* My recent leaves */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#1D9E75]" />
                My Leave Requests
              </h2>
              <Link href="/leave" className="text-xs text-[#1D9E75] hover:underline">View all →</Link>
            </div>
            {(myLeaves?.length ?? 0) === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No recent requests</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {myLeaves?.map(l => (
                  <div key={l.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{l.leave_type} — {fmtDate(l.date_from)}</p>
                      <p className="text-xs text-gray-500">{fmtDate(l.date_to)}</p>
                    </div>
                    <StatusBadge status={l.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // EMPLOYEE DASHBOARD
  // ══════════════════════════════════════════════════════════════════════
  const [
    { data: myMonthAtt },
    { data: myRecentLeaves },
  ] = await Promise.all([
    empId ? supabase.from('attendance_daily')
      .select('status, red_marks_total')
      .eq('employee_id', empId)
      .gte('date', monthStart)
      .lte('date', today) : Promise.resolve({ data: [] }),

    empId ? supabase.from('leave_requests')
      .select('id, leave_type, date_from, date_to, status, created_at')
      .eq('employee_id', empId)
      .order('created_at', { ascending: false })
      .limit(5) : Promise.resolve({ data: [] }),
  ])

  const daysPresent = myMonthAtt?.filter(a => ['P','PL','HPL','UL','HUL'].includes(a.status)).length ?? 0
  const daysAbsent  = myMonthAtt?.filter(a => ['A','AAA'].includes(a.status)).length ?? 0
  const myRedMarks  = myMonthAtt?.reduce((s, a) => s + (a.red_marks_total ?? 0), 0) ?? 0

  const { data: myEmp } = empId ? await supabase
    .from('employees')
    .select('first_name, designation, department')
    .eq('id', empId)
    .single() : { data: null }

  const hour = d.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {myEmp?.first_name ?? 'there'} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {myEmp?.designation} · {myEmp?.department}
        </p>
      </div>

      {/* Today's status */}
      <div className="bg-gradient-to-r from-[#1D9E75] to-[#178a63] rounded-2xl p-5 text-white">
        <p className="text-xs text-green-200 uppercase tracking-wide font-medium mb-3">Today</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-green-200">Status</p>
            <p className="font-bold text-lg">{myToday?.status ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-green-200">Check In</p>
            <p className="font-bold text-lg">
              {myToday?.check_in
                ? new Date(myToday.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-green-200">Check Out</p>
            <p className="font-bold text-lg">
              {myToday?.check_out
                ? new Date(myToday.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="PL Balance"     value={(myBalance?.pl_balance ?? 0).toFixed(1)} color="green"  icon={FileText}  href="/leave"       sub={`FY ${fy}`} />
        <StatCard label="Present"        value={daysPresent}                              color="blue"   icon={CheckCircle} href="/attendance" sub="This month" />
        <StatCard label="Absent"         value={daysAbsent}                               color="red"    icon={XCircle}   href="/attendance"  sub="This month" />
        <StatCard label="Red Marks"      value={myRedMarks}                               color="yellow" icon={Flag}      href="/attendance"  sub="This month" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/leave/apply" className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1D9E75] hover:shadow-sm transition-all">
          <div className="w-10 h-10 bg-[#1D9E75]/10 rounded-xl flex items-center justify-center">
            <FileText className="h-5 w-5 text-[#1D9E75]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Apply Leave</p>
            <p className="text-xs text-gray-400">{(myBalance?.pl_balance ?? 0).toFixed(1)} PL remaining</p>
          </div>
        </Link>
        <Link href="/time-off/apply" className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1D9E75] hover:shadow-sm transition-all">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Timer className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Time Off</p>
            <p className="text-xs text-gray-400">Personal errand pass</p>
          </div>
        </Link>
        <Link href="/on-duty/apply" className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1D9E75] hover:shadow-sm transition-all">
          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">On Duty</p>
            <p className="text-xs text-gray-400">Official movement</p>
          </div>
        </Link>
        <Link href="/attendance" className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1D9E75] hover:shadow-sm transition-all">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
            <Clock className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Attendance</p>
            <p className="text-xs text-gray-400">View your history</p>
          </div>
        </Link>
      </div>

      {/* Recent leaves */}
      {(myRecentLeaves?.length ?? 0) > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#1D9E75]" />
              My Recent Leaves
            </h2>
            <Link href="/leave" className="text-xs text-[#1D9E75] hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {myRecentLeaves?.map(l => (
              <div key={l.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{l.leave_type}</p>
                  <p className="text-xs text-gray-500">{fmtDate(l.date_from)}{l.date_from !== l.date_to ? ` → ${fmtDate(l.date_to)}` : ''}</p>
                </div>
                <StatusBadge status={l.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
