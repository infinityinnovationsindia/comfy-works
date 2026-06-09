import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Compute the first day of the NEXT month (exclusive upper bound).
// Works for all months — no Feb 29, June 31, etc. issues.
function nextMonthStart(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  // m is 1-12. Next month:
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  return `${nextY}-${String(nextM).padStart(2, '0')}-01`
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const vehicle = searchParams.get('vehicle')
  const month = searchParams.get('month') // YYYY-MM

  let query = supabase.from('vehicle_trips')
    .select(`*, vehicle_trip_legs(*), approved_by_emp:approved_by(first_name,last_name)`)
    .order('date', { ascending: false })

  if (vehicle) query = query.eq('vehicle', vehicle)
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    // FIX: month boundary — use [first_of_month, first_of_next_month) range.
    // Old code used `${month}-31` which fails for Feb/Apr/Jun/Sep/Nov.
    const start = `${month}-01`
    const end = nextMonthStart(month)
    query = query.gte('date', start).lt('date', end)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { vehicle, date, time_out, odometer_out, legs, approved_by } = body

  const { data: trip, error } = await supabase.from('vehicle_trips').insert({
    vehicle, date, time_out, odometer_out, approved_by
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (legs?.length) {
    await supabase.from('vehicle_trip_legs').insert(
      legs.map((l: any) => ({
        trip_id: trip.id,
        destination: l.destination,
        ref_no: l.ref_no || null,
        issued_by: l.issued_by || null,
        accompanying_employee_id: l.accompanying_employee_id || null,
        remark: l.remark || null,
      }))
    )
  }
  return NextResponse.json(trip)
}
