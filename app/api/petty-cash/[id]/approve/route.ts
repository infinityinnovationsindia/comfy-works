
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { action, approver_id, reason } = await req.json()
  const status = action === 'approve' ? 'Approved' : 'Rejected'
  const update: any = { status, approved_by: approver_id }
  if (action === 'approve') update.approved_at = new Date().toISOString()
  if (action === 'reject') update.rejection_reason = reason

  const { error } = await supabase.from('petty_cash_requests').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
