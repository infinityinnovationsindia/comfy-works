const fs = require('fs');
const path = require('path');

const BASE = 'C:\\Users\\Dell\\comfy-works';

function write(filePath, content) {
  const full = path.join(BASE, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('✓ wrote', filePath);
}

// ─────────────────────────────────────────────
// 1. SQL MIGRATION
// ─────────────────────────────────────────────
write('phase3.sql', `
-- Phase 3 SQL Migration — run in Supabase SQL Editor BEFORE running setup-phase3.js

-- PETTY CASH
CREATE TABLE IF NOT EXISTS petty_cash_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) NOT NULL,
  department text NOT NULL,
  amount numeric NOT NULL,
  purpose text NOT NULL,
  receipt_url text,
  status text DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected','Settled')),
  approved_by uuid REFERENCES employees(id),
  approved_at timestamptz,
  settled_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE petty_cash_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_petty_cash" ON petty_cash_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_petty_cash" ON petty_cash_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_petty_cash" ON petty_cash_requests FOR UPDATE TO authenticated USING (true);

-- Add device_user_id to attendance_punches if missing
ALTER TABLE attendance_punches ADD COLUMN IF NOT EXISTS device_user_id text;

-- Index for security dashboard queries
CREATE INDEX IF NOT EXISTS idx_time_off_date ON time_off_permissions(date);
CREATE INDEX IF NOT EXISTS idx_on_duty_date ON on_duty_requests(date);
CREATE INDEX IF NOT EXISTS idx_work_perm_date ON work_permissions(date_of_work);
CREATE INDEX IF NOT EXISTS idx_visitors_time_in ON visitors(time_in);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_date ON vehicle_trips(date);
CREATE INDEX IF NOT EXISTS idx_ot_date ON overtime_requests(date_of_ot);

SELECT 'Phase 3 SQL migration complete' as result;
`);

// ─────────────────────────────────────────────
// 2. OVERTIME — API ROUTES
// ─────────────────────────────────────────────
write('app/api/overtime/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function userClient() {
  const c = cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: (n) => c.get(n)?.value, set: () => {}, remove: () => {} }
  })
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  let query = supabase.from('overtime_requests')
    .select(\`*, raised_by_emp:raised_by(first_name,last_name,employee_no), overtime_employees(*, employee:employee_id(first_name,last_name,employee_no))\`)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { project_site, date_requested, date_of_ot, time_from, time_to, employees, raised_by } = body

  // Calculate planned hours
  const [fh, fm] = time_from.split(':').map(Number)
  const [th, tm] = time_to.split(':').map(Number)
  const planned_hours = ((th * 60 + tm) - (fh * 60 + fm)) / 60

  const { data: ot, error } = await supabase.from('overtime_requests').insert({
    project_site, date_requested, date_of_ot, time_from, time_to,
    planned_hours: Math.max(0, planned_hours), raised_by, status: 'Pending'
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert employee list
  if (employees?.length) {
    await supabase.from('overtime_employees').insert(
      employees.map((e: any) => ({ overtime_request_id: ot.id, employee_id: e.employee_id, remark: e.remark || null }))
    )
  }

  // Notify Shailoo via WhatsApp
  const { data: shailoo } = await supabase.from('employees').select('id,first_name,last_name').eq('employee_no','CF-002').single()
  if (shailoo) {
    await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL}/api/notify\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ot_approval',
        to: shailoo.id,
        message: \`OT Request for \${employees?.length || 0} employees on \${date_of_ot} at \${project_site}. \${time_from}–\${time_to} (\${planned_hours.toFixed(1)} hrs). TAP TO REVIEW: \${process.env.NEXT_PUBLIC_APP_URL}/overtime/\${ot.id}\`
      })
    }).catch(() => {})
  }

  return NextResponse.json(ot)
}
`);

write('app/api/overtime/[id]/approve/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = adminClient()
  const { approver_id, approver_role, action, comment } = await req.json()
  const { id } = params

  const { data: ot } = await supabase.from('overtime_requests').select('*').eq('id', id).single()
  if (!ot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'reject') {
    await supabase.from('overtime_requests').update({ status: 'Rejected' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  let update: any = {}
  let nextNotifyRole = null

  if (approver_role === 'shailoo' && ot.status === 'Pending') {
    update = { status: 'Shailoo_Approved', shailoo_approved_at: new Date().toISOString() }
    nextNotifyRole = 'kush'
  } else if (approver_role === 'kush' && ot.status === 'Shailoo_Approved') {
    update = { status: 'Approved', kush_approved_at: new Date().toISOString() }
    // Notify all employees
    const { data: emps } = await supabase.from('overtime_employees')
      .select('employee:employee_id(id,first_name,last_name)').eq('overtime_request_id', id)
    for (const emp of emps || []) {
      await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL}/api/notify\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ot_approved', to: (emp.employee as any).id,
          message: \`Your OT has been approved for \${ot.date_of_ot}. Time: \${ot.time_from}–\${ot.time_to} at \${ot.project_site}\` })
      }).catch(() => {})
    }
  } else {
    return NextResponse.json({ error: 'Invalid approval step' }, { status: 400 })
  }

  await supabase.from('overtime_requests').update(update).eq('id', id)

  if (nextNotifyRole === 'kush') {
    const { data: kush } = await supabase.from('employees').select('id').eq('employee_no','CF-004').single()
    if (kush) {
      await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL}/api/notify\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ot_kush_approval', to: kush.id,
          message: \`Shailoo approved OT for \${ot.date_of_ot}. Your final approval needed. TAP: \${process.env.NEXT_PUBLIC_APP_URL}/overtime/\${id}\` })
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
`);

// ─────────────────────────────────────────────
// 3. WORK PERMISSION — API
// ─────────────────────────────────────────────
write('app/api/work-permission/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  let query = supabase.from('work_permissions')
    .select(\`*, raised_by_emp:raised_by(first_name,last_name,employee_no), work_permission_employees(*, employee:employee_id(first_name,last_name,employee_no))\`)
    .order('created_at', { ascending: false })
  if (date) query = query.eq('date_of_work', date)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { project_site, date_requested, date_of_work, time_from, time_to, sip_pip, employees, raised_by } = body

  const { data: wp, error } = await supabase.from('work_permissions').insert({
    project_site, date_requested, date_of_work, time_from, time_to,
    sip_pip: sip_pip || 'N/A', raised_by, status: 'Pending'
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (employees?.length) {
    await supabase.from('work_permission_employees').insert(
      employees.map((e: any) => ({ work_permission_id: wp.id, employee_id: e.employee_id, remark: e.remark || null }))
    )
  }

  // Notify Kush
  const { data: kush } = await supabase.from('employees').select('id').eq('employee_no','CF-004').single()
  if (kush) {
    await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL}/api/notify\`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'work_permission', to: kush.id,
        message: \`Work Permission request for \${employees?.length || 0} employees on \${date_of_work}. Time: \${time_from}–\${time_to}. SIP/PIP: \${sip_pip || 'N/A'}. TAP TO APPROVE: \${process.env.NEXT_PUBLIC_APP_URL}/work-permission/\${wp.id}\` })
    }).catch(() => {})
  }

  return NextResponse.json(wp)
}
`);

write('app/api/work-permission/[id]/approve/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = adminClient()
  const { action } = await req.json()
  const status = action === 'approve' ? 'Approved' : 'Rejected'
  const update: any = { status }
  if (action === 'approve') update.kush_approved_at = new Date().toISOString()

  await supabase.from('work_permissions').update(update).eq('id', params.id)

  if (action === 'approve') {
    // Notify security + all employees
    const { data: emps } = await supabase.from('work_permission_employees')
      .select('employee:employee_id(id,first_name,last_name)').eq('work_permission_id', params.id)
    const { data: wp } = await supabase.from('work_permissions').select('*').eq('id', params.id).single()
    for (const emp of emps || []) {
      await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL}/api/notify\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'work_perm_approved', to: (emp.employee as any).id,
          message: \`Work Permission APPROVED for \${wp?.date_of_work}. You may work from \${wp?.time_from} to \${wp?.time_to}. Show this message at security gate.\` })
      }).catch(() => {})
    }
  }
  return NextResponse.json({ ok: true })
}
`);

// ─────────────────────────────────────────────
// 4. VEHICLE LOGISTICS — API
// ─────────────────────────────────────────────
write('app/api/vehicles/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const vehicle = searchParams.get('vehicle')
  const month = searchParams.get('month') // YYYY-MM

  let query = supabase.from('vehicle_trips')
    .select(\`*, vehicle_trip_legs(*), approved_by_emp:approved_by(first_name,last_name)\`)
    .order('date', { ascending: false })

  if (vehicle) query = query.eq('vehicle', vehicle)
  if (month) {
    query = query.gte('date', \`\${month}-01\`).lte('date', \`\${month}-31\`)
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
`);

write('app/api/vehicles/[id]/return/route.ts', `
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
`);

// ─────────────────────────────────────────────
// 5. VISITORS — API
// ─────────────────────────────────────────────
write('app/api/visitors/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const search = searchParams.get('search')

  let query = supabase.from('visitors')
    .select(\`*, host:host_employee_id(first_name,last_name,employee_no)\`)
    .order('time_in', { ascending: false })

  if (date) {
    query = query.gte('time_in', \`\${date}T00:00:00+05:30\`).lte('time_in', \`\${date}T23:59:59+05:30\`)
  }
  if (search) {
    query = query.or(\`name.ilike.%\${search}%,company.ilike.%\${search}%\`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { name, company, purpose, host_employee_id, photo_url, id_proof_type, id_proof_number, security_notes } = body

  const { data: visitor, error } = await supabase.from('visitors').insert({
    name, company, purpose, host_employee_id, photo_url,
    id_proof_type, id_proof_number, security_notes,
    time_in: new Date().toISOString()
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify host
  if (host_employee_id) {
    const { data: host } = await supabase.from('employees').select('first_name').eq('id', host_employee_id).single()
    await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL}/api/notify\`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'visitor', to: host_employee_id,
        message: \`\${name} from \${company || 'unknown'} is at the gate to see you. Purpose: \${purpose}\` })
    }).catch(() => {})
  }
  return NextResponse.json(visitor)
}
`);

write('app/api/visitors/[id]/checkout/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await supabase.from('visitors').update({ time_out: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
`);

// ─────────────────────────────────────────────
// 6. PETTY CASH — API
// ─────────────────────────────────────────────
write('app/api/petty-cash/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const supabase = adminClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  let query = supabase.from('petty_cash_requests')
    .select(\`*, employee:employee_id(first_name,last_name,employee_no), approver:approved_by(first_name,last_name)\`)
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  const body = await req.json()
  const { employee_id, department, amount, purpose } = body

  const { data, error } = await supabase.from('petty_cash_requests').insert({
    employee_id, department, amount, purpose, status: 'Pending'
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify Kiran + Neal
  for (const empNo of ['CF-031','CF-080']) {
    const { data: approver } = await supabase.from('employees').select('id').eq('employee_no', empNo).single()
    if (approver) {
      await fetch(\`\${process.env.NEXT_PUBLIC_APP_URL}/api/notify\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'petty_cash', to: approver.id,
          message: \`Petty cash request: ₹\${amount} for \${purpose} (\${department} dept). TAP TO REVIEW: \${process.env.NEXT_PUBLIC_APP_URL}/petty-cash/\${data.id}\` })
      }).catch(() => {})
    }
  }
  return NextResponse.json(data)
}
`);

write('app/api/petty-cash/[id]/approve/route.ts', `
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
`);

write('app/api/petty-cash/[id]/settle/route.ts', `
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { receipt_url } = await req.json()
  const { error } = await supabase.from('petty_cash_requests')
    .update({ status: 'Settled', receipt_url, settled_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
`);

// ─────────────────────────────────────────────
// 7. OVERTIME PAGE
// ─────────────────────────────────────────────
write('app/(dashboard)/overtime/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const STATUS_COLORS: Record<string,string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Shailoo_Approved: 'bg-blue-100 text-blue-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
}

export default function OvertimePage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/overtime').then(r => r.json()).then(d => { setRecords(d); setLoading(false) })
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Overtime Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Form #28 — Dual approval: Shailoo → Kush</p>
        </div>
        <Link href="/overtime/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New OT Request
        </Link>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {records.map(ot => (
            <Link key={ot.id} href={\`/overtime/\${ot.id}\`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{ot.project_site}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {new Date(ot.date_of_ot).toLocaleDateString('en-IN')} · {ot.time_from}–{ot.time_to} · {ot.planned_hours?.toFixed(1)} hrs planned
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {ot.overtime_employees?.length || 0} employees · Raised by {ot.raised_by_emp?.first_name} {ot.raised_by_emp?.last_name}
                    </div>
                  </div>
                  <span className={\`px-2 py-1 rounded text-xs font-medium \${STATUS_COLORS[ot.status] || 'bg-gray-100 text-gray-600'}\`}>
                    {ot.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {records.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No overtime requests yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
`);

write('app/(dashboard)/overtime/new/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewOTPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedEmps, setSelectedEmps] = useState<any[]>([])
  const [form, setForm] = useState({ project_site:'', date_requested: new Date().toISOString().split('T')[0], date_of_ot:'', time_from:'17:00', time_to:'20:00' })
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    fetch('/api/employees').then(r=>r.json()).then(d => setEmployees(d.filter((e:any)=>e.status==='Active')))
    fetch('/api/auth/me').then(r=>r.json()).then(d=>setMe(d))
  }, [])

  const plannedHours = (() => {
    if (!form.time_from || !form.time_to) return 0
    const [fh,fm] = form.time_from.split(':').map(Number)
    const [th,tm] = form.time_to.split(':').map(Number)
    return Math.max(0,((th*60+tm)-(fh*60+fm))/60)
  })()

  function addEmployee(emp: any) {
    if (!selectedEmps.find(e=>e.employee_id===emp.id)) {
      setSelectedEmps(prev=>[...prev,{employee_id:emp.id,name:\`\${emp.first_name} \${emp.last_name}\`,employee_no:emp.employee_no,remark:''}])
    }
  }

  async function submit() {
    if (!form.project_site || !form.date_of_ot || selectedEmps.length===0) {
      alert('Please fill all fields and add at least one employee')
      return
    }
    setSaving(true)
    const res = await fetch('/api/overtime',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...form, employees:selectedEmps, raised_by:me?.id})
    })
    if (res.ok) { router.push('/overtime') }
    else { alert('Failed to submit'); setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Overtime Request</h1>

      <div className="bg-white border rounded-xl p-6 space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Site *</label>
          <input value={form.project_site} onChange={e=>setForm(p=>({...p,project_site:e.target.value}))}
            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Satellite Showroom, Bodakdev Villa"/>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Requested</label>
            <input type="date" value={form.date_requested} onChange={e=>setForm(p=>({...p,date_requested:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of OT *</label>
            <input type="date" value={form.date_of_ot} onChange={e=>setForm(p=>({...p,date_of_ot:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Time</label>
            <input type="time" value={form.time_from} onChange={e=>setForm(p=>({...p,time_from:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Time</label>
            <input type="time" value={form.time_to} onChange={e=>setForm(p=>({...p,time_to:e.target.value}))}
              className="w-full border rounded-lg px-3 py-2 text-sm"/>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
          Planned OT Hours: <strong>{plannedHours.toFixed(1)} hrs</strong>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 mb-6">
        <h2 className="font-medium mb-3">Add Employees ({selectedEmps.length}/10)</h2>
        <select className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
          onChange={e=>{const emp=employees.find(x=>x.id===e.target.value);if(emp)addEmployee(emp);e.target.value=''}}>
          <option value="">-- Select employee to add --</option>
          {employees.map(e=>(
            <option key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</option>
          ))}
        </select>
        {selectedEmps.length > 0 && (
          <div className="space-y-2">
            {selectedEmps.map((emp,i)=>(
              <div key={emp.employee_id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium w-24">{emp.employee_no}</span>
                <span className="text-sm flex-1">{emp.name}</span>
                <input value={emp.remark} onChange={e=>{const copy=[...selectedEmps];copy[i].remark=e.target.value;setSelectedEmps(copy)}}
                  placeholder="Remark" className="border rounded px-2 py-1 text-xs w-32"/>
                <button onClick={()=>setSelectedEmps(prev=>prev.filter(x=>x.employee_id!==emp.employee_id))}
                  className="text-red-500 text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={submit} disabled={saving}
        className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
        {saving ? 'Submitting...' : 'Submit OT Request → Shailoo Patel for approval'}
      </button>
    </div>
  )
}
`);

write('app/(dashboard)/overtime/[id]/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

export default function OTDetailPage() {
  const { id } = useParams()
  const [ot, setOt] = useState<any>(null)
  const [me, setMe] = useState<any>(null)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    fetch(\`/api/overtime?id=\${id}\`).then(r=>r.json()).then(d=>setOt(Array.isArray(d)?d.find((x:any)=>x.id===id):d))
    fetch('/api/auth/me').then(r=>r.json()).then(setMe)
  }, [id])

  async function act(action: string) {
    setActing(true)
    const role = me?.employee_no === 'CF-002' ? 'shailoo' : me?.employee_no === 'CF-004' ? 'kush' : null
    if (!role) { alert('You are not an approver for this request'); setActing(false); return }
    await fetch(\`/api/overtime/\${id}/approve\`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ approver_id: me.id, approver_role: role, action })
    })
    window.location.reload()
  }

  if (!ot) return <div className="p-6 text-gray-400">Loading...</div>

  const canApprove = (me?.employee_no === 'CF-002' && ot.status === 'Pending') ||
                     (me?.employee_no === 'CF-004' && ot.status === 'Shailoo_Approved')

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Overtime Request</h1>
      <p className="text-sm text-gray-500 mb-6">{ot.project_site} · {new Date(ot.date_of_ot).toLocaleDateString('en-IN')}</p>

      <div className="bg-white border rounded-xl p-6 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Date of OT</span><div className="font-medium">{new Date(ot.date_of_ot).toLocaleDateString('en-IN')}</div></div>
          <div><span className="text-gray-500">Time</span><div className="font-medium">{ot.time_from} – {ot.time_to}</div></div>
          <div><span className="text-gray-500">Planned Hours</span><div className="font-medium">{ot.planned_hours?.toFixed(1)} hrs</div></div>
          <div><span className="text-gray-500">Status</span><div className="font-medium">{ot.status.replace('_',' ')}</div></div>
          <div><span className="text-gray-500">Raised By</span><div className="font-medium">{ot.raised_by_emp?.first_name} {ot.raised_by_emp?.last_name}</div></div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 mb-4">
        <h2 className="font-medium mb-3">Employees ({ot.overtime_employees?.length})</h2>
        <div className="divide-y">
          {ot.overtime_employees?.map((e:any,i:number)=>(
            <div key={e.id} className="py-2 flex items-center justify-between text-sm">
              <span>{i+1}. {e.employee?.first_name} {e.employee?.last_name}</span>
              <span className="text-gray-400">{e.employee?.employee_no}</span>
              {e.remark && <span className="text-gray-400 text-xs">{e.remark}</span>}
            </div>
          ))}
        </div>
      </div>

      {canApprove && (
        <div className="flex gap-3">
          <button onClick={()=>act('approve')} disabled={acting}
            className="flex-1 py-3 bg-green-700 text-white rounded-xl font-medium">
            ✓ Approve
          </button>
          <button onClick={()=>act('reject')} disabled={acting}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium">
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  )
}
`);

// ─────────────────────────────────────────────
// 8. WORK PERMISSION PAGE
// ─────────────────────────────────────────────
write('app/(dashboard)/work-permission/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function WorkPermissionPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/work-permission').then(r=>r.json()).then(d=>{setRecords(d);setLoading(false)})
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Work Permission</h1>
          <p className="text-sm text-gray-500 mt-1">Form #26 — After-hours factory access</p>
        </div>
        <Link href="/work-permission/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New Request
        </Link>
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {records.map(wp=>(
            <Link key={wp.id} href={\`/work-permission/\${wp.id}\`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 cursor-pointer">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{wp.project_site || 'General Work'}</div>
                    <div className="text-sm text-gray-500 mt-1">{new Date(wp.date_of_work).toLocaleDateString('en-IN')} · {wp.time_from}–{wp.time_to}</div>
                    <div className="text-sm text-gray-500">{wp.work_permission_employees?.length||0} employees · SIP/PIP: {wp.sip_pip}</div>
                  </div>
                  <span className={\`px-2 py-1 rounded text-xs font-medium \${wp.status==='Approved'?'bg-green-100 text-green-800':wp.status==='Rejected'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}\`}>
                    {wp.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {records.length===0 && <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No work permissions yet.</div>}
        </div>
      )}
    </div>
  )
}
`);

write('app/(dashboard)/work-permission/new/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewWorkPermPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedEmps, setSelectedEmps] = useState<any[]>([])
  const [form, setForm] = useState({ project_site:'', date_requested: new Date().toISOString().split('T')[0], date_of_work:'', time_from:'18:00', time_to:'21:00', sip_pip:'N/A' })
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    fetch('/api/employees').then(r=>r.json()).then(d=>setEmployees(d.filter((e:any)=>e.status==='Active')))
    fetch('/api/auth/me').then(r=>r.json()).then(setMe)
  },[])

  async function submit() {
    if (!form.date_of_work || selectedEmps.length===0) { alert('Please fill date and add employees'); return }
    setSaving(true)
    const res = await fetch('/api/work-permission',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({...form, employees:selectedEmps, raised_by:me?.id})
    })
    if (res.ok) router.push('/work-permission')
    else { alert('Failed'); setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Work Permission Request</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4 mb-6">
        <div><label className="block text-sm font-medium mb-1">Project Site</label>
          <input value={form.project_site} onChange={e=>setForm(p=>({...p,project_site:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional"/></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Date of Work *</label>
            <input type="date" value={form.date_of_work} onChange={e=>setForm(p=>({...p,date_of_work:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
          <div><label className="block text-sm font-medium mb-1">SIP / PIP</label>
            <select value={form.sip_pip} onChange={e=>setForm(p=>({...p,sip_pip:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option>N/A</option><option>SIP</option><option>PIP</option>
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">From</label>
            <input type="time" value={form.time_from} onChange={e=>setForm(p=>({...p,time_from:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
          <div><label className="block text-sm font-medium mb-1">To</label>
            <input type="time" value={form.time_to} onChange={e=>setForm(p=>({...p,time_to:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        </div>
      </div>
      <div className="bg-white border rounded-xl p-6 mb-6">
        <h2 className="font-medium mb-3">Add Employees</h2>
        <select className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
          onChange={e=>{const emp=employees.find(x=>x.id===e.target.value);if(emp&&!selectedEmps.find(s=>s.employee_id===emp.id))setSelectedEmps(prev=>[...prev,{employee_id:emp.id,name:\`\${emp.first_name} \${emp.last_name}\`,employee_no:emp.employee_no}]);e.target.value=''}}>
          <option value="">-- Add employee --</option>
          {employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</option>)}
        </select>
        {selectedEmps.map(emp=>(
          <div key={emp.employee_id} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2 mb-2 text-sm">
            <span className="font-medium">{emp.employee_no}</span>
            <span className="flex-1">{emp.name}</span>
            <button onClick={()=>setSelectedEmps(prev=>prev.filter(x=>x.employee_id!==emp.employee_id))} className="text-red-500">✕</button>
          </div>
        ))}
      </div>
      <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
        {saving?'Submitting...':'Submit → Kush Patel for approval'}
      </button>
    </div>
  )
}
`);

// ─────────────────────────────────────────────
// 9. VEHICLE LOGISTICS PAGE
// ─────────────────────────────────────────────
write('app/(dashboard)/vehicles/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function VehiclesPage() {
  const [trips, setTrips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vehicle, setVehicle] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const month = today.slice(0,7)

  useEffect(() => {
    const params = new URLSearchParams({ month })
    if (vehicle) params.set('vehicle', vehicle)
    fetch(\`/api/vehicles?\${params}\`).then(r=>r.json()).then(d=>{setTrips(d);setLoading(false)})
  }, [vehicle])

  const totalKM = trips.reduce((sum,t)=>sum+(t.total_km||0),0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Vehicle Logistics</h1>
          <p className="text-sm text-gray-500 mt-1">Form #61 — TATA 407 & Piaggio</p>
        </div>
        <Link href="/vehicles/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + Log Trip
        </Link>
      </div>

      <div className="flex gap-3 mb-6">
        {['','TATA_407','Piaggio'].map(v=>(
          <button key={v} onClick={()=>setVehicle(v)}
            className={\`px-4 py-2 rounded-lg text-sm font-medium border \${vehicle===v?'bg-green-700 text-white border-green-700':'bg-white text-gray-600 border-gray-200'}\`}>
            {v||'All Vehicles'}
          </button>
        ))}
        <div className="ml-auto bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800">
          This month: <strong>{totalKM.toFixed(0)} KM</strong>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {trips.map(trip=>(
            <Link key={trip.id} href={\`/vehicles/\${trip.id}\`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{trip.vehicle==='TATA_407'?'TATA 407':'Piaggio'}</span>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{new Date(trip.date).toLocaleDateString('en-IN')}</span>
                      {!trip.time_in && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">OUT</span>}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Out: {trip.time_out||'—'} · In: {trip.time_in||'—'} · {trip.vehicle_trip_legs?.length||0} stops
                    </div>
                    <div className="text-sm text-gray-500">
                      ODO: {trip.odometer_out} → {trip.odometer_in||'—'} = <strong>{trip.total_km||0} KM</strong>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {trips.length===0 && <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No trips this month.</div>}
        </div>
      )}
    </div>
  )
}
`);

write('app/(dashboard)/vehicles/new/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewTripPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({ vehicle:'TATA_407', date:new Date().toISOString().split('T')[0], time_out:'', odometer_out:'' })
  const [legs, setLegs] = useState([{destination:'',ref_no:'',remark:'',accompanying_employee_id:''}])
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(()=>{
    fetch('/api/employees').then(r=>r.json()).then(setEmployees)
    fetch('/api/auth/me').then(r=>r.json()).then(setMe)
  },[])

  async function submit() {
    if (!form.time_out||!form.odometer_out){alert('Fill time out and odometer');return}
    setSaving(true)
    const res = await fetch('/api/vehicles',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...form,odometer_out:Number(form.odometer_out),legs,approved_by:me?.id})})
    if(res.ok)router.push('/vehicles')
    else{alert('Failed');setSaving(false)}
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Log Vehicle Trip</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Vehicle</label>
            <select value={form.vehicle} onChange={e=>setForm(p=>({...p,vehicle:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="TATA_407">TATA 407</option>
              <option value="Piaggio">Piaggio</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">Date</label>
            <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Time Out *</label>
            <input type="time" value={form.time_out} onChange={e=>setForm(p=>({...p,time_out:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
          <div><label className="block text-sm font-medium mb-1">Odometer Out *</label>
            <input type="number" value={form.odometer_out} onChange={e=>setForm(p=>({...p,odometer_out:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 45230"/></div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Trip Stops / Destinations</h2>
          <button onClick={()=>setLegs(p=>[...p,{destination:'',ref_no:'',remark:'',accompanying_employee_id:''}])}
            className="text-sm text-green-700">+ Add Stop</button>
        </div>
        {legs.map((leg,i)=>(
          <div key={i} className="border rounded-lg p-3 mb-3 space-y-2">
            <div className="flex gap-2">
              <input value={leg.destination} onChange={e=>{const c=[...legs];c[i].destination=e.target.value;setLegs(c)}}
                placeholder="Destination *" className="flex-1 border rounded px-2 py-1.5 text-sm"/>
              <input value={leg.ref_no} onChange={e=>{const c=[...legs];c[i].ref_no=e.target.value;setLegs(c)}}
                placeholder="Ref No." className="w-28 border rounded px-2 py-1.5 text-sm"/>
            </div>
            <div className="flex gap-2">
              <select value={leg.accompanying_employee_id} onChange={e=>{const c=[...legs];c[i].accompanying_employee_id=e.target.value;setLegs(c)}}
                className="flex-1 border rounded px-2 py-1.5 text-sm">
                <option value="">Driver only</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
              {legs.length>1&&<button onClick={()=>setLegs(prev=>prev.filter((_,j)=>j!==i))} className="text-red-500 text-sm">Remove</button>}
            </div>
          </div>
        ))}
      </div>

      <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
        {saving?'Saving...':'Log Trip Departure'}
      </button>
    </div>
  )
}
`);

// ─────────────────────────────────────────────
// 10. VISITORS PAGE
// ─────────────────────────────────────────────
write('app/(dashboard)/visitors/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const today = new Date().toISOString().split('T')[0]

  function load() {
    const params = new URLSearchParams({ date: today })
    if (search) params.set('search', search)
    fetch(\`/api/visitors?\${params}\`).then(r=>r.json()).then(d=>{setVisitors(d);setLoading(false)})
  }

  useEffect(()=>{ load() },[search])

  async function checkout(id:string) {
    await fetch(\`/api/visitors/\${id}/checkout\`,{method:'POST'})
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Visitor Management</h1>
          <p className="text-sm text-gray-500 mt-1">Today's visitors — {new Date().toLocaleDateString('en-IN')}</p>
        </div>
        <Link href="/visitors/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + Register Visitor
        </Link>
      </div>

      <input type="text" placeholder="Search by name or company..." value={search}
        onChange={e=>setSearch(e.target.value)}
        className="border rounded-lg px-4 py-2.5 text-sm w-full max-w-sm mb-4"/>

      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {visitors.map(v=>(
            <div key={v.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{v.name}</div>
                  <div className="text-sm text-gray-500">{v.company||'—'} · To meet: {v.host?.first_name} {v.host?.last_name}</div>
                  <div className="text-sm text-gray-500 mt-1">Purpose: {v.purpose}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    In: {new Date(v.time_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}
                    {v.time_out && \` · Out: \${new Date(v.time_out).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}\`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!v.time_out ? (
                    <button onClick={()=>checkout(v.id)}
                      className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-medium">
                      Log Exit
                    </button>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">Exited</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {visitors.length===0 && <div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No visitors today.</div>}
        </div>
      )}
    </div>
  )
}
`);

write('app/(dashboard)/visitors/new/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewVisitorPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({ name:'', company:'', purpose:'', host_employee_id:'', id_proof_type:'Aadhaar', id_proof_number:'', security_notes:'' })
  const [saving, setSaving] = useState(false)

  useEffect(()=>{fetch('/api/employees').then(r=>r.json()).then(setEmployees)},[])

  async function submit() {
    if(!form.name||!form.purpose||!form.host_employee_id){alert('Name, purpose and host are required');return}
    setSaving(true)
    const res = await fetch('/api/visitors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    if(res.ok)router.push('/visitors')
    else{alert('Failed');setSaving(false)}
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">Register Visitor</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Visitor Name *</label>
          <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Full name"/></div>
        <div><label className="block text-sm font-medium mb-1">Company / Organisation</label>
          <input value={form.company} onChange={e=>setForm(p=>({...p,company:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        <div><label className="block text-sm font-medium mb-1">Purpose of Visit *</label>
          <input value={form.purpose} onChange={e=>setForm(p=>({...p,purpose:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        <div><label className="block text-sm font-medium mb-1">Whom to Meet *</label>
          <select value={form.host_employee_id} onChange={e=>setForm(p=>({...p,host_employee_id:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">-- Select employee --</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_no})</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">ID Proof Type</label>
            <select value={form.id_proof_type} onChange={e=>setForm(p=>({...p,id_proof_type:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option>Aadhaar</option><option>PAN</option><option>Driving Licence</option><option>Voter ID</option><option>Passport</option>
            </select></div>
          <div><label className="block text-sm font-medium mb-1">ID Number</label>
            <input value={form.id_proof_number} onChange={e=>setForm(p=>({...p,id_proof_number:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Security Notes</label>
          <textarea value={form.security_notes} onChange={e=>setForm(p=>({...p,security_notes:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm h-20" placeholder="Optional"/></div>
        <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
          {saving?'Registering...':'Register & Notify Host'}
        </button>
      </div>
    </div>
  )
}
`);

// ─────────────────────────────────────────────
// 11. PETTY CASH PAGE
// ─────────────────────────────────────────────
write('app/(dashboard)/petty-cash/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function PettyCashPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Pending')

  useEffect(()=>{
    fetch(\`/api/petty-cash?status=\${tab}\`).then(r=>r.json()).then(d=>{setRecords(d);setLoading(false)})
  },[tab])

  const total = records.filter(r=>r.status==='Approved').reduce((s,r)=>s+r.amount,0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Petty Cash</h1>
        <Link href="/petty-cash/new" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New Request
        </Link>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {['Pending','Approved','Settled','Rejected'].map(t=>(
          <button key={t} onClick={()=>{setTab(t);setLoading(true)}}
            className={\`px-4 py-2 rounded-md text-sm font-medium \${tab===t?'bg-white shadow text-gray-900':'text-gray-500'}\`}>{t}</button>
        ))}
      </div>

      {loading?<div className="text-center py-12 text-gray-400">Loading...</div>:(
        <div className="space-y-3">
          {records.map(r=>(
            <Link key={r.id} href={\`/petty-cash/\${r.id}\`}>
              <div className="bg-white border rounded-xl p-4 hover:border-green-300 cursor-pointer">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">₹{r.amount.toLocaleString('en-IN')} — {r.purpose}</div>
                    <div className="text-sm text-gray-500 mt-1">{r.employee?.first_name} {r.employee?.last_name} · {r.department}</div>
                    <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('en-IN')}</div>
                  </div>
                  <span className={\`px-2 py-1 rounded text-xs font-medium \${r.status==='Approved'?'bg-green-100 text-green-800':r.status==='Rejected'?'bg-red-100 text-red-800':r.status==='Settled'?'bg-teal-100 text-teal-800':'bg-yellow-100 text-yellow-800'}\`}>
                    {r.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
          {records.length===0&&<div className="text-center py-12 text-gray-400 bg-white border rounded-xl">No {tab.toLowerCase()} requests.</div>}
        </div>
      )}
    </div>
  )
}
`);

write('app/(dashboard)/petty-cash/new/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const DEPARTMENTS = ['Factory','Showroom','Site','Admin','Design','Accounts']

export default function NewPettyCashPage() {
  const router = useRouter()
  const [form, setForm] = useState({ department:'Factory', amount:'', purpose:'' })
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(()=>{fetch('/api/auth/me').then(r=>r.json()).then(setMe)},[])

  async function submit() {
    if(!form.amount||!form.purpose){alert('Fill all fields');return}
    setSaving(true)
    const res = await fetch('/api/petty-cash',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...form,amount:Number(form.amount),employee_id:me?.id})})
    if(res.ok)router.push('/petty-cash')
    else{alert('Failed');setSaving(false)}
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">New Petty Cash Request</h1>
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Department</label>
          <select value={form.department} onChange={e=>setForm(p=>({...p,department:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
            {DEPARTMENTS.map(d=><option key={d}>{d}</option>)}
          </select></div>
        <div><label className="block text-sm font-medium mb-1">Amount (₹) *</label>
          <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 500"/></div>
        <div><label className="block text-sm font-medium mb-1">Purpose *</label>
          <textarea value={form.purpose} onChange={e=>setForm(p=>({...p,purpose:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm h-24" placeholder="Describe what this cash will be used for"/></div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          Request will be sent to Kiran Patel & Neal Patel for approval.
        </div>
        <button onClick={submit} disabled={saving} className="w-full py-3 bg-green-700 text-white rounded-xl font-medium disabled:opacity-60">
          {saving?'Submitting...':'Submit Request'}
        </button>
      </div>
    </div>
  )
}
`);

// ─────────────────────────────────────────────
// 12. SECURITY DASHBOARD — tablet optimised
// ─────────────────────────────────────────────
write('app/(dashboard)/security/page.tsx', `
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function SecurityDashboard() {
  const [data, setData] = useState<any>({ timeOff:[], onDuty:[], workPerms:[], visitors:[], vehicles:[] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('passes')
  const today = new Date().toISOString().split('T')[0]

  useEffect(()=>{
    Promise.all([
      fetch(\`/api/time-off?date=\${today}&status=Approved\`).then(r=>r.json()).catch(()=>[]),
      fetch(\`/api/on-duty?date=\${today}&status=Approved\`).then(r=>r.json()).catch(()=>[]),
      fetch(\`/api/work-permission?date=\${today}&status=Approved\`).then(r=>r.json()).catch(()=>[]),
      fetch(\`/api/visitors?date=\${today}\`).then(r=>r.json()).catch(()=>[]),
      fetch(\`/api/vehicles?month=\${today.slice(0,7)}\`).then(r=>r.json()).catch(()=>[]),
    ]).then(([timeOff,onDuty,workPerms,visitors,vehicles])=>{
      setData({ timeOff:Array.isArray(timeOff)?timeOff:[], onDuty:Array.isArray(onDuty)?onDuty:[], workPerms:Array.isArray(workPerms)?workPerms:[], visitors:Array.isArray(visitors)?visitors:[], vehicles:Array.isArray(vehicles)?vehicles.filter((v:any)=>v.date===today):[] })
      setLoading(false)
    })
  },[])

  const tabs = [
    {key:'passes',label:'Time Off',count:data.timeOff.length},
    {key:'onduty',label:'On Duty',count:data.onDuty.length},
    {key:'afterhours',label:'After Hours',count:data.workPerms.length},
    {key:'visitors',label:'Visitors',count:data.visitors.filter((v:any)=>!v.time_out).length},
    {key:'vehicles',label:'Vehicles',count:data.vehicles.length},
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">COMFY — Security Gate</h1>
          <p className="text-gray-400 text-sm">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</p>
        </div>
        <Link href="/visitors/new" className="px-4 py-3 bg-green-600 rounded-xl text-sm font-bold">
          + VISITOR
        </Link>
      </div>

      {/* Tab bar — large touch targets */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={\`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium \${tab===t.key?'bg-green-600':'bg-gray-800'}\`}>
            {t.label} {t.count>0&&<span className="ml-1 bg-white text-gray-900 rounded-full px-1.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading?<div className="text-center py-12 text-gray-500">Loading...</div>:(
        <>
          {/* TIME OFF PASSES */}
          {tab==='passes' && (
            <div className="space-y-3">
              {data.timeOff.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No time-off passes today</div>}
              {data.timeOff.map((p:any)=>(
                <div key={p.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="text-lg font-bold">{p.employee?.first_name} {p.employee?.last_name}</div>
                  <div className="text-gray-400 text-sm">{p.employee?.employee_no}</div>
                  <div className="mt-2 text-green-400 font-medium">OUT: {p.time_out}</div>
                  <div className="text-gray-300 text-sm mt-1">Purpose: {p.purpose}</div>
                  {p.time_in_actual&&<div className="text-blue-400 text-sm mt-1">RETURNED: {p.time_in_actual}</div>}
                </div>
              ))}
            </div>
          )}

          {/* ON DUTY */}
          {tab==='onduty' && (
            <div className="space-y-3">
              {data.onDuty.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No on-duty passes today</div>}
              {data.onDuty.map((od:any)=>(
                <div key={od.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="text-lg font-bold">{od.employee?.first_name} {od.employee?.last_name}</div>
                  <div className="text-gray-400 text-sm">{od.employee?.employee_no}</div>
                  <div className="mt-2 text-green-400 font-medium">OUT: {od.time_out} → IN: {od.time_in_planned}</div>
                  <div className="text-gray-300 text-sm mt-1">To: {od.location_to_visit}</div>
                  <div className="text-gray-300 text-sm">Vehicle: {od.vehicle_type} {od.vehicle_number&&\`(\${od.vehicle_number})\`}</div>
                  {od.outward_km&&<div className="text-gray-400 text-xs mt-1">ODO Out: {od.outward_km}</div>}
                </div>
              ))}
            </div>
          )}

          {/* AFTER HOURS WORK PERMISSION */}
          {tab==='afterhours' && (
            <div className="space-y-3">
              {data.workPerms.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No after-hours permissions today</div>}
              {data.workPerms.map((wp:any)=>(
                <div key={wp.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="text-green-400 font-bold text-lg">APPROVED — Work Permission</div>
                  <div className="text-gray-300 mt-1">{wp.time_from} – {wp.time_to}</div>
                  {wp.project_site&&<div className="text-gray-400 text-sm">Site: {wp.project_site}</div>}
                  <div className="text-gray-400 text-sm">SIP/PIP: {wp.sip_pip}</div>
                  <div className="mt-3 space-y-1">
                    {wp.work_permission_employees?.map((e:any)=>(
                      <div key={e.id} className="flex items-center gap-2 text-sm">
                        <span className="w-16 text-gray-500">{e.employee?.employee_no}</span>
                        <span>{e.employee?.first_name} {e.employee?.last_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VISITORS */}
          {tab==='visitors' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Active: {data.visitors.filter((v:any)=>!v.time_out).length} · Total today: {data.visitors.length}</span>
                <Link href="/visitors/new" className="px-3 py-2 bg-green-600 rounded-lg text-sm">+ Register</Link>
              </div>
              {data.visitors.map((v:any)=>(
                <div key={v.id} className={\`rounded-xl p-4 \${v.time_out?'bg-gray-900 border border-gray-700':'bg-gray-800'}\`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold">{v.name}</div>
                      <div className="text-gray-400 text-sm">{v.company}</div>
                      <div className="text-gray-300 text-sm mt-1">→ {v.host?.first_name} {v.host?.last_name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        IN: {new Date(v.time_in).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}
                        {v.time_out&&\` · OUT: \${new Date(v.time_out).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'})}\`}
                      </div>
                    </div>
                    {!v.time_out&&(
                      <button onClick={async()=>{await fetch(\`/api/visitors/\${v.id}/checkout\`,{method:'POST'});window.location.reload()}}
                        className="px-3 py-2 bg-gray-600 rounded-lg text-sm">Log Exit</button>
                    )}
                  </div>
                </div>
              ))}
              {data.visitors.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No visitors today</div>}
            </div>
          )}

          {/* VEHICLES */}
          {tab==='vehicles' && (
            <div className="space-y-3">
              <Link href="/vehicles/new" className="block text-center py-3 bg-gray-800 rounded-xl text-sm text-green-400">+ Log New Trip</Link>
              {data.vehicles.map((v:any)=>(
                <div key={v.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div className="font-bold">{v.vehicle==='TATA_407'?'TATA 407':'Piaggio'}</div>
                    {!v.time_in&&<span className="bg-orange-500 text-white text-xs px-2 py-1 rounded">OUT</span>}
                    {v.time_in&&<span className="bg-green-600 text-white text-xs px-2 py-1 rounded">RETURNED</span>}
                  </div>
                  <div className="text-gray-400 text-sm mt-1">Out: {v.time_out||'—'} · In: {v.time_in||'—'}</div>
                  <div className="text-gray-400 text-sm">ODO: {v.odometer_out} → {v.odometer_in||'pending'}</div>
                  {v.total_km>0&&<div className="text-green-400 text-sm font-medium">{v.total_km} KM total</div>}
                </div>
              ))}
              {data.vehicles.length===0&&<div className="text-center py-12 text-gray-500 bg-gray-800 rounded-xl">No vehicle trips today</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
`);

// ─────────────────────────────────────────────
// 13. SIDEBAR UPDATE
// ─────────────────────────────────────────────
write('components/sidebar-phase3-additions.txt', `
Add these items to your existing sidebar component under appropriate sections:

FACTORY OPERATIONS section:
- /overtime → "Overtime" (icon: Clock)
- /work-permission → "Work Permission" (icon: Shield)
- /vehicles → "Vehicles" (icon: Truck)

GATE section:
- /visitors → "Visitors" (icon: Users)
- /security → "Security Gate" (icon: Lock) — show on all roles

FINANCE section (after Payroll):
- /petty-cash → "Petty Cash" (icon: Wallet) — show for accounts + super_admin + all

Add to approvals inbox: overtime_requests, work_permissions, petty_cash_requests
`);

// ─────────────────────────────────────────────
// 14. README
// ─────────────────────────────────────────────
write('PHASE3-README.md', `
# Phase 3 — Factory Control

## Step 1: Run SQL migration
Open Supabase → SQL Editor → paste contents of phase3.sql → Run

## Step 2: Run this script
\`\`\`
node setup-phase3.js
\`\`\`

## Step 3: Update sidebar
Open your sidebar component and add the nav items listed in:
components/sidebar-phase3-additions.txt

## Step 4: Deploy
\`\`\`
cd C:\\Users\\Dell\\comfy-works
git add -A
git commit -m "feat: Phase 3 - Factory Control (OT, Work Permission, Vehicles, Visitors, Petty Cash, Security Gate)"
git push
\`\`\`

## What's built in Phase 3

| Module | Route | Form # |
|--------|-------|--------|
| Overtime Request | /overtime | Form #28 |
| Work Permission | /work-permission | Form #26 |
| Vehicle Logistics | /vehicles | Form #61 |
| Visitor Management | /visitors | — |
| Petty Cash | /petty-cash | — |
| Security Dashboard | /security | Gate tablet |

## Security Dashboard
Go to /security on any device. Designed for cheap Android tablet at gate.
Dark theme, large touch targets, 5 tabs: Time Off / On Duty / After Hours / Visitors / Vehicles.

## Next: Phase 4
- Recruitment module (Candidate Data Bank)
- Employee Onboarding checklist
- Employee Loan (5-partner approval)
- Showroom biometric integration
- PWA (add to home screen)
- Full reports suite
`);

console.log('\n✅ Phase 3 setup complete!');
console.log('📋 Next steps:');
console.log('   1. Run phase3.sql in Supabase SQL Editor');
console.log('   2. node setup-phase3.js');
console.log('   3. Update sidebar with items from components/sidebar-phase3-additions.txt');
console.log('   4. git add -A && git commit -m "feat: Phase 3" && git push');

