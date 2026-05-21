import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function createSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) { try { cookieStore.set({ name, value, ...options }) } catch {} },
        remove(name: string, options: any) { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
      },
    }
  )
}

export async function POST(request: Request) {
  const supabase = createSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (account?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })
  }

  const body = await request.json()

  if (body.action === 'test-whatsapp') {
    const phone = body.phone?.replace(/\D/g, '')
    if (!phone) return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })

    try {
      const { sendWhatsApp } = await import('@/lib/whatsapp')
      await sendWhatsApp(
        phone,
        `Comfy Works: WhatsApp test ✓\nSent at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
      )
      return NextResponse.json({ success: true, message: `Test message sent to ${phone}` })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
