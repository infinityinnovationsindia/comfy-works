import { redirect } from 'next/navigation'

// Root redirect — sends authenticated users to dashboard
// Auth check is handled by the (dashboard) layout
export default function RootPage() {
  redirect('/dashboard')
}
