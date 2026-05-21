'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { LayoutGrid, Users, Clock, CalendarDays, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const NAV = [
  { href:'/attendance', label:'Attendance',  icon:LayoutGrid },
  { href:'/employees',  label:'Employees',   icon:Users },
  { href:'/shifts',     label:'Shifts',       icon:Clock },
  { href:'/holidays',   label:'Holidays',     icon:CalendarDays },
];

export default function NavSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await sb.auth.signOut();
    router.push('/login'); router.refresh();
  }

  const Links = () => (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)}
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              active ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100')}>
            <Icon size={18} /><span>{label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen bg-white border-r border-gray-200 p-4">
        <div className="flex items-center gap-2.5 px-3 mb-8">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-none">Comfy Works</p>
            <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{role.replace(/_/g,' ')}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1"><Links /></nav>
        <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors mt-4">
          <LogOut size={18} /><span>Sign Out</span>
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-sm">Comfy Works</span>
        </div>
        <button onClick={() => setOpen(v => !v)} className="p-2 rounded-lg hover:bg-gray-100">
          {open ? <X size={20}/> : <Menu size={20}/>}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30"/>
          <nav className="absolute top-0 left-0 bottom-0 w-64 bg-white p-4 space-y-1 pt-16 shadow-xl"
            onClick={e => e.stopPropagation()}>
            <Links />
            <div className="pt-4 border-t border-gray-200 mt-4">
              <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 w-full">
                <LogOut size={18}/><span>Sign Out</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
