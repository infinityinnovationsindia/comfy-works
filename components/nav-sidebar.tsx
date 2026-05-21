'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'
import {
  Clock, Users, Calendar, FileText, CheckSquare,
  Timer, Navigation, BarChart3, DollarSign, User,
  Settings, LogOut, Flag, ChevronDown, ChevronRight,
  Menu, X, Armchair, Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'

type UserRole =
  | 'super_admin' | 'production_head' | 'design_head'
  | 'project_head' | 'accounts' | 'supervisor' | 'employee' | 'security'

interface NavChild { label: string; href: string }
interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  roles: UserRole[]
  children?: NavChild[]
}

const ALL_ROLES: UserRole[] = [
  'super_admin','production_head','design_head','project_head',
  'accounts','supervisor','employee','security'
]
const MGMT_ROLES: UserRole[] = [
  'super_admin','production_head','design_head','project_head','accounts','supervisor'
]
const ADMIN_ROLES: UserRole[] = ['super_admin','accounts']
const SUPER_ONLY: UserRole[] = ['super_admin']

const NAV_ITEMS: NavItem[] = [
  // ── Daily Operations ──────────────────────────────────────
  {
    label: 'Attendance',
    href: '/attendance',
    icon: Clock,
    roles: ALL_ROLES.filter(r => r !== 'security'),
  },
  {
    label: 'Leave',
    icon: FileText,
    roles: ALL_ROLES.filter(r => r !== 'security'),
    children: [
      { label: 'Apply Leave',    href: '/leave/apply' },
      { label: 'My Leaves',      href: '/leave' },
      { label: 'Leave Balances', href: '/leave/balances' },
    ],
  },
  {
    label: 'Time Off',
    icon: Timer,
    roles: ['super_admin','production_head','design_head','project_head','supervisor','employee'],
    children: [
      { label: 'Apply Time Off', href: '/time-off/apply' },
      { label: 'My Requests',    href: '/time-off' },
    ],
  },
  {
    label: 'On Duty',
    icon: Navigation,
    roles: ['super_admin','production_head','design_head','project_head','supervisor','employee'],
    children: [
      { label: 'Apply On Duty', href: '/on-duty/apply' },
      { label: 'My Requests',   href: '/on-duty' },
    ],
  },
  // ── Approvals ─────────────────────────────────────────────
  {
    label: 'Approvals',
    href: '/approvals',
    icon: CheckSquare,
    roles: MGMT_ROLES,
  },
  // ── Management ────────────────────────────────────────────
  {
    label: 'Employees',
    href: '/employees',
    icon: Users,
    roles: MGMT_ROLES,
  },
  {
    label: 'Red Marks',
    href: '/red-marks',
    icon: Flag,
    roles: ['super_admin','accounts','supervisor','production_head'],
  },
  {
    label: 'Payroll',
    href: '/payroll',
    icon: DollarSign,
    roles: ADMIN_ROLES,
  },
  // ── Admin ─────────────────────────────────────────────────
  {
    label: 'Shifts',
    href: '/shifts',
    icon: Calendar,
    roles: SUPER_ONLY,
  },
  {
    label: 'Holidays',
    href: '/holidays',
    icon: BarChart3,
    roles: SUPER_ONLY,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: SUPER_ONLY,
  },
]

export default function Sidebar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [userRole,     setUserRole]     = useState<UserRole>('employee')
  const [userName,     setUserName]     = useState('Loading...')
  const [pendingCount, setPendingCount] = useState(0)
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [expanded,     setExpanded]     = useState<string[]>([])

  // Auto-expand active parent
  useEffect(() => {
    NAV_ITEMS.forEach(item => {
      if (item.children?.some(c => pathname.startsWith(c.href))) {
        setExpanded(prev => prev.includes(item.label) ? prev : [...prev, item.label])
      }
    })
  }, [pathname])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: account } = await supabase
        .from('user_accounts')
        .select('role, employee:employees(first_name, last_name)')
        .eq('id', user.id)
        .single()

      if (account) {
        setUserRole(account.role as UserRole)
        const emp = account.employee as any
        if (emp) setUserName(`${emp.first_name} ${emp.last_name}`)
      }

      // Pending approvals badge
      try {
        const res = await fetch('/api/approvals?count=1')
        const json = await res.json()
        setPendingCount(json.count || 0)
      } catch { /* ignore */ }
    }
    load()
  }, [supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function toggleExpanded(label: string) {
    setExpanded(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(userRole))

  const roleLabel: Record<UserRole, string> = {
    super_admin:     'Super Admin',
    production_head: 'Production Head',
    design_head:     'Design Head',
    project_head:    'Project Head',
    accounts:        'Accounts',
    supervisor:      'Supervisor',
    employee:        'Employee',
    security:        'Security',
  }

  function NavLink({ item }: { item: NavItem }) {
    const isActive   = item.href ? pathname.startsWith(item.href) : false
    const isExpanded = expanded.includes(item.label)

    if (item.children) {
      const childActive = item.children.some(c => pathname.startsWith(c.href))
      return (
        <div>
          <button
            onClick={() => toggleExpanded(item.label)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              childActive
                ? 'bg-[#1D9E75]/10 text-[#1D9E75]'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {isExpanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>
          {isExpanded && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-gray-200 pl-3">
              {item.children.map(child => (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'block px-2 py-1.5 rounded text-sm transition-colors',
                    pathname.startsWith(child.href)
                      ? 'text-[#1D9E75] font-medium'
                      : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  {child.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link
        href={item.href!}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-[#1D9E75] text-white shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.label === 'Approvals' && pendingCount > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-gray-100">
        <div className="w-8 h-8 bg-[#1D9E75] rounded-lg flex items-center justify-center flex-shrink-0">
          <Armchair className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-sm leading-tight">Comfy Works</p>
          <p className="text-xs text-[#1D9E75] font-medium truncate">{roleLabel[userRole]}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleItems.map(item => (
          <NavLink key={item.label} item={item} />
        ))}
      </nav>

      {/* Bottom: Profile + Logout */}
      <div className="border-t border-gray-100 px-3 py-3 space-y-0.5">
        <Link
          href="/profile"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname === '/profile'
              ? 'bg-[#1D9E75] text-white'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <User className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate">{userName}</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white border border-gray-200 rounded-lg p-2 shadow-sm"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transition-transform duration-200 lg:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 lg:border-r lg:border-gray-200 lg:bg-white lg:z-30">
        <SidebarContent />
      </div>
    </>
  )
}
