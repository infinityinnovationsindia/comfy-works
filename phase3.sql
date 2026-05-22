
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
