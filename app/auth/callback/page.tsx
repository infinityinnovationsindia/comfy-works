'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const [status, setStatus] = useState('Signing you in…');
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Handle the session from the URL (magic link / PKCE)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setStatus('Logged in! Redirecting…');
        router.replace('/attendance');
      } else {
        // Try exchanging code from URL
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
          supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
            if (error) {
              setStatus('Login failed. Please try again.');
              setTimeout(() => router.replace('/login'), 2000);
            } else {
              router.replace('/attendance');
            }
          });
        } else {
          // Listen for auth state change (magic link sets session automatically)
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
              router.replace('/attendance');
            } else if (event === 'SIGNED_OUT') {
              router.replace('/login');
            }
          });
          // Timeout fallback
          setTimeout(() => {
            subscription.unsubscribe();
            router.replace('/login');
          }, 5000);
        }
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"/>
      <p className="text-sm text-gray-600">{status}</p>
    </div>
  );
}
