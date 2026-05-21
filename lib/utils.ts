import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'2-digit', year:'numeric' }).format(d);
}

export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', hour12:true }).format(d);
}

export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata' }).format(new Date());
}

export function fmtRupees(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n);
}

export function calcProbationEnd(joining: string): string {
  const d = new Date(joining);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export function currentFY(): string {
  const now = new Date();
  const yr = now.getFullYear();
  const start = now.getMonth() >= 3 ? yr : yr - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export const STATUS_COLORS: Record<string, string> = {
  P:'bg-green-100 text-green-800', PL:'bg-blue-100 text-blue-800',
  HPL:'bg-blue-50 text-blue-700', UL:'bg-orange-100 text-orange-800',
  HUL:'bg-orange-50 text-orange-700', H:'bg-purple-100 text-purple-800',
  A:'bg-red-100 text-red-800', AAA:'bg-red-200 text-red-900',
  AA:'bg-red-100 text-red-800', HA:'bg-yellow-100 text-yellow-800',
  LC:'bg-yellow-50 text-yellow-700', EG:'bg-yellow-50 text-yellow-700',
  '—':'bg-gray-100 text-gray-500',
};

export const STATUS_LABELS: Record<string, string> = {
  P:'Present', PL:'Paid Leave', HPL:'Half PL', UL:'Unpaid Leave', HUL:'Half UL',
  H:'Holiday', A:'Single Punch', AAA:'Unauth Absent', AA:'Unauth Half', HA:'Unauth 1Hr',
  LC:'Late Coming', EG:'Early Going',
};
