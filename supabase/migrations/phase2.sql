
-- ═══════════════════════════════════════════════════════
-- Comfy Works Phase 2 — SQL Migration
-- Run in Supabase SQL Editor before deploying Phase 2
-- ═══════════════════════════════════════════════════════

-- 1. leave_requests: add 3-step approval chain columns
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS l3_approver_id        uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS l3_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS l3_comment            text,
  ADD COLUMN IF NOT EXISTS approval_token        text,
  ADD COLUMN IF NOT EXISTS chain_type            text CHECK (chain_type IN ('2step','3step')),
  ADD COLUMN IF NOT EXISTS notice_violation      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_retroactive        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pl_to_deduct          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_by           uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS rejected_at           timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason      text,
  ADD COLUMN IF NOT EXISTS out_of_station        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS out_of_station_contact text,
  ADD COLUMN IF NOT EXISTS out_of_station_address text;

-- 2. attendance_daily: add correction tracking columns
ALTER TABLE attendance_daily
  ADD COLUMN IF NOT EXISTS is_manually_corrected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction_reason     text,
  ADD COLUMN IF NOT EXISTS corrected_by          text,
  ADD COLUMN IF NOT EXISTS corrected_at          timestamptz,
  ADD COLUMN IF NOT EXISTS original_status       text,
  ADD COLUMN IF NOT EXISTS leave_id              uuid REFERENCES leave_requests(id);

-- 3. employees: ensure daily salary rate column exists
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS daily_salary_rate     numeric;

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_leave_approval_token ON leave_requests(approval_token);
CREATE INDEX IF NOT EXISTS idx_leave_status         ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_employee       ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_date_range     ON leave_requests(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_att_daily_date       ON attendance_daily(date);
CREATE INDEX IF NOT EXISTS idx_att_daily_emp_date   ON attendance_daily(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_att_daily_status     ON attendance_daily(status);

-- 5. Atomic PL deduction function (race-condition safe)
CREATE OR REPLACE FUNCTION increment_pl_used(
  p_employee_id   uuid,
  p_financial_year text,
  p_amount        numeric
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO leave_balances (employee_id, financial_year, pl_earned, pl_used)
  VALUES (p_employee_id, p_financial_year, 0, p_amount)
  ON CONFLICT (employee_id, financial_year)
  DO UPDATE SET pl_used = leave_balances.pl_used + p_amount;
$$;

-- 6. View: PL balance computed automatically
CREATE OR REPLACE VIEW leave_balances_view AS
SELECT
  lb.*,
  lb.pl_earned - lb.pl_used AS pl_balance
FROM leave_balances lb;

-- 7. Monthly red marks summary view (for payroll)
CREATE OR REPLACE VIEW monthly_red_marks_summary AS
SELECT
  employee_id,
  DATE_TRUNC('month', date::date) AS month,
  SUM(red_marks_morning) AS total_morning_marks,
  SUM(red_marks_evening) AS total_evening_marks,
  SUM(red_marks_total)   AS total_marks
FROM attendance_daily
GROUP BY employee_id, DATE_TRUNC('month', date::date);

-- 8. Ensure leave_balances has unique constraint
ALTER TABLE leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_emp_fy_unique;
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_emp_fy_unique UNIQUE (employee_id, financial_year);

-- 9. Update status check on leave_requests to allow Pending and all intermediate statuses
-- (existing check should already have these; if not, run:)
-- ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
-- ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check
--   CHECK (status IN ('Pending','L1_Approved','L2_Approved','Approved','Rejected','Cancelled'));

-- 10. Leave balances for current FY for all active employees (if missing)
INSERT INTO leave_balances (employee_id, financial_year, pl_earned, pl_used)
SELECT
  id,
  CASE WHEN EXTRACT(month FROM NOW()) >= 4
    THEN EXTRACT(year FROM NOW())::text || '-' || RIGHT((EXTRACT(year FROM NOW()) + 1)::text, 2)
    ELSE (EXTRACT(year FROM NOW()) - 1)::text || '-' || RIGHT(EXTRACT(year FROM NOW())::text, 2)
  END,
  0,
  0
FROM employees
WHERE status = 'Active'
ON CONFLICT (employee_id, financial_year) DO NOTHING;
