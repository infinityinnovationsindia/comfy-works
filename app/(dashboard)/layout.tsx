import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import NavSidebar from '@/components/nav-sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: n => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: account } = await supabase
    .from('user_accounts').select('role').eq('id', session.user.id).single();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <NavSidebar role={account?.role ?? 'employee'} />
      <main className="flex-1 p-4 md:p-6 pt-16 md:pt-6 min-w-0 max-w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
