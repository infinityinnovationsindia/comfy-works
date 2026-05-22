
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = adminClient()
  const { time_in, odometer_in } = await req.json()

  // Get current odometer_out
  const { data: trip } = await supabase.from('vehicle_trips').select('odometer_out').eq('id', params.id).single()
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const total_km = Math.max(0, (odometer_in || 0) - (trip.odometer_out || 0))

  const { error } = await supabase.from('vehicle_trips')
    .update({ time_in, odometer_in, total_km }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, total_km })
}
