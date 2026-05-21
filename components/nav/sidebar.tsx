
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  {
    group: 'Attendance',
    items: [
      { href: '/attendance',         label: 'Today', icon: '📍' },
      { href: '/attendance/weekly',  label: 'Weekly', icon: '📅' },
      { href: '/attendance/monthly', label: 'Monthly', icon: '🗓' },
    ],
  },
  {
    group: 'Leave',
    items: [
      { href: '/leave',       label: 'Leave Requests', icon: '📋' },
      { href: '/leave/apply', label: 'Apply Leave',    icon: '✍️' },
    ],
  },
  {
    group: 'Movement',
    items: [
      { href: '/time-off',       label: 'Time Off',    icon: '🚪' },
      { href: '/on-duty',        label: 'On Duty',     icon: '🚗' },
    ],
  },
  {
    group: 'Payroll',
    items: [
      { href: '/payroll', label: 'Payroll Report', icon: '💰' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { href: '/employees', label: 'Employees', icon: '👥' },
      { href: '/biometric', label: 'Biometric Sync', icon: '👆' },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-56 min-h-screen bg-white border-r flex flex-col py-4">
      <div className="px-4 mb-6">
        <div className="text-green-800 font-bold text-lg">Comfy Works</div>
        <div className="text-gray-400 text-xs">Factory HR</div>
      </div>

      <nav className="flex-1 px-2 space-y-6">
        {NAV.map(section => (
          <div key={section.group}>
            <div className="px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {section.group}
            </div>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = path === item.href || (item.href !== '/' && path.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                      active ? 'bg-green-50 text-green-800 font-medium' : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 pt-4 border-t">
        <div className="text-xs text-gray-400 text-center">Comfy Furniture Centre</div>
      </div>
    </aside>
  );
}
